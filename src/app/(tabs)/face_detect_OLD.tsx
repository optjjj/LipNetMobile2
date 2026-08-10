/**
 * LipNetMobile - Face & Lip Detection Pipeline
 * 
 * High-Level Flow:
 * 1. The camera captures video at 25 FPS.
 * 2. For every frame, a Face Detector finds the user's face and lip contours.
 * 3. We calculate the center of the lips, their tilt, and crop a 128x64 image of just the mouth.
 * 4. These cropped images are saved until we reach 75 frames (exactly 3 seconds of video).
 * 5. The 75 frames are bundled into a PyTorch Tensor and fed into an ONNX AI Model.
 * 6. The model predicts the text, which is decoded into English and spoken/displayed.
 */

// ==========================================
// SECTION 1: IMPORTS
// ==========================================
import React, { ReactNode, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, Button, View, useWindowDimensions, Image } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// Vision Camera (Handles the physical camera hardware and frame processing)
import { CameraPosition, CameraRef, Camera, useCameraDevice, useCameraPermission, useVideoOutput, useFrameOutput, Frame } from 'react-native-vision-camera';
import { Face, FaceDetectorOptions, useFaceDetector } from 'react-native-vision-camera-face-detector';
import { crop, rotateImage } from 'vision-camera-cropper';
import { scheduleOnRN } from 'react-native-worklets';

// Reanimated (Handles smooth UI animations without blocking the main thread)
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

// AI and Machine Learning (Handles running the LipNet model on-device)
import * as ort from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';
import { createPyTorchLipNetTensor } from '../../../assets/TensorHelper';


// ==========================================
// SECTION 2: TYPES & CONSTANTS
// ==========================================

/**
 * State Machine: Tracks the current phase of the application.
 * LipNet requires exactly 75 frames to make a prediction, so we must strictly control the flow.
 */
type StateMachine =
    | 'idle'        // Camera is on, waiting for user to press "Start Capture"
    | 'capturing'   // Actively recording and cropping lips. Ends when 75 frames are reached.
    | 'inferencing' // Running the AI model (takes a few seconds, UI should show loading)
    | 'speaking'    // AI is done, translating the result via text-to-speech
    | 'done';       // Finished, ready to reset to idle


// ==========================================
// SECTION 3: HELPER COMPONENTS
// ==========================================

export interface ProgressBarRef {
    updateCount: (count: number) => void;
}

/**
 * FrameProgressBar: Displays how many frames have been captured.
 * We use `forwardRef` and `useImperativeHandle` so the heavy camera frame processor 
 * can update this text directly without causing the entire screen to re-render.
 */
const FrameProgressBar = forwardRef<ProgressBarRef, {}>((props, ref) => {
    const [count, setCount] = useState(0);

    useImperativeHandle(ref, () => ({
        updateCount: (newCount: number) => setCount(newCount),
    }));

    return (
        <View style={styles.progressContainer}>
            <Text style={styles.progressText}> Valid Frames: [{count}/75]</Text>
        </View>
    );
});

/**
 * CropPreview: A debug window showing what the AI is actually "seeing".
 * It displays the 128x64 cropped image of the user's lips in the top left corner.
 */
const CropPreview = forwardRef((props, ref) => {
    const [imageBase64, setImageBase64] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
        updateImage: (newBase64: string) => setImageBase64(newBase64)
    }));

    if (!imageBase64) return null;

    return (
        <View style={styles.cropPreviewContainer}>
            <Text style={styles.cropPreviewText}>AI CROP</Text>
            <Image
                source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
                style={styles.cropPreviewImage}
                resizeMode='contain'
            />
        </View>
    );
});


// ==========================================
// SECTION 4: MACHINE LEARNING LOGIC
// ==========================================

/**
 * CTC (Connectionist Temporal Classification) Decoder
 * 
 * Why do we need this? 
 * When speaking a word like "HELLO", lip movements span multiple frames. 
 * The AI might predict "H-H-H-E-E-L-L-L-O" frame-by-frame. 
 * This decoder squashes duplicates and removes "blank" frames to get the true word.
 */
function decodeCTC(cpuData: Float32Array) {
    // LipNet has a vocabulary of 28 options: 26 letters, 1 space, and 1 "blank" token.
    const vocab = {
        0: '', 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e', 6: 'f', 7: 'g', 8: 'h', 9: 'i',
        10: 'j', 11: 'k', 12: 'l', 13: 'm', 14: 'n', 15: 'o', 16: 'p', 17: 'q',
        18: 'r', 19: 's', 20: 't', 21: 'u', 22: 'v', 23: 'w', 24: 'x', 25: 'y', 26: 'z',
        27: ' ' // Space character
    };
    
    const blankToken = 27; // Index 27 is usually the CTC Blank in standard LipNet PyTorch exports.
    let prevClassIdx = -1;
    let finalString = "";

    // Iterate over all 75 frames
    for (let t = 0; t < 75; t++) {
        // Extract the 28 probability scores for this specific frame
        const frameStart = t * 28;
        const frameLogits = cpuData.slice(frameStart, frameStart + 28);

        // Find which letter has the highest probability score
        let maxProb = -Infinity;
        let maxIdx = -1;
        for (let i = 0; i < 28; i++) {
            if (frameLogits[i] > maxProb) {
                maxProb = frameLogits[i];
                maxIdx = i;
            }
        }

        // Apply CTC Rules: Ignore blanks AND ignore consecutive duplicate characters
        if (maxIdx !== blankToken && maxIdx !== prevClassIdx) {
            finalString += (vocab as any)[maxIdx];
        }
        prevClassIdx = maxIdx;
    }

    return finalString.trim();
}


// ==========================================
// SECTION 5: MAIN SCREEN COMPONENT
// ==========================================

export default function FaceDetectionScreen(): ReactNode {
    
    // --- 5.1: Device & Layout Setup ---
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    
    // Tracks the physical size of the camera view on the screen to calculate bounding boxes
    const [cameraDimensions, setCameraDimensions] = useState({ width: 448, height: 997 });

    // Reanimated Shared Values (Allows the Worklet thread to update variables without blocking React)
    const frameWidth = useSharedValue(500);
    const frameHeight = useSharedValue(1000);
    const isCapturing = useSharedValue<boolean>(false);
    
    // UI bounding box values for the lips
    const mouthW = useSharedValue(0);
    const mouthH = useSharedValue(0);
    const mouthX = useSharedValue(0);
    const mouthY = useSharedValue(0);
    const tiltAmount = useSharedValue(0); // Tracks head tilt to rotate the bounding box

    // App State Management
    const [appState, setAppState] = useState<StateMachine>('idle');
    const frameBuffer = useRef<string[]>([]); // Stores the 75 base64 images
    const progressRef = useRef<ProgressBarRef>(null);
    const previewRef = useRef<any>(null);

    // --- 5.2: Camera Setup ---
    const { hasPermission, requestPermission } = useCameraPermission();
    const [cameraMounted, setCameraMounted] = useState<boolean>(true);
    const cameraDevice = useCameraDevice('front');
    const camera = useRef<CameraRef>(null);

    // We constrain the video to 500x1000 to improve performance. High-res video kills ML processing.
    const videoOutput = useVideoOutput({ targetResolution: { width: 500, height: 1000 } });

    // Request permissions on mount
    useEffect(() => {
        if (!hasPermission) requestPermission();
    }, [hasPermission]);

    // Face Detector Configuration
    const faceDetectorOptions = useRef<FaceDetectorOptions>({
        performanceMode: 'fast',
        runClassifications: false, // We don't care if eyes are open/closed
        runContours: true,         // WE NEED THIS: Gets the coordinates of the lips
        runLandmarks: false,
        windowWidth: width,
        windowHeight: height,
        autoMode: false
    }).current;
    
    const FaceDetector = useFaceDetector(faceDetectorOptions);

    // --- 5.3: Core State Handlers ---
    
    // Pushes a newly cropped mouth image to the buffer array.
    const saveFrameBuffer = (base64MouthData: string) => {
        frameBuffer.current.push(base64MouthData);
        progressRef.current?.updateCount(frameBuffer.current.length);
        
        // Once we hit exactly 75 frames, stop recording and start thinking
        if (frameBuffer.current.length === 75) {
            isCapturing.value = false;
            setAppState('inferencing');
            processFramesAndRunAI();
        }
    };

    const handleStartCapture = () => {
        if (appState !== 'idle' && appState !== 'done') return;
        frameBuffer.current = [];
        progressRef.current?.updateCount(0);
        isCapturing.value = true;
        setAppState('capturing');
    };

    const handleStopCapture = () => {
        isCapturing.value = false;
        frameBuffer.current = [];
        setAppState('done');
    };

    // Passed into scheduleOnRN by the worklet to update our debug preview
    const setDebugPreview = (base64: string) => {
        if (previewRef.current) previewRef.current.updateImage(base64);
    };

    // --- 5.4: Artificial Intelligence Pipeline ---
    
    async function processFramesAndRunAI() {
        try {
            console.log("Generating PyTorch Tensor...");
            
            // 1. Format the 75 raw images into a mathematical matrix (Tensor)
            const flatTensorData = await createPyTorchLipNetTensor(frameBuffer.current);
            
            // 2. Load the pre-trained ONNX Model
            const modelAsset = Asset.fromModule(require('../../../assets/lipnet_single.onnx'));
            await modelAsset.downloadAsync();
            const cleanPath = modelAsset.localUri!.replace('file://', '');
            const session = await ort.InferenceSession.create(cleanPath);

            // 3. Define the PyTorch Shape requirements
            // [Batch Size, Color Channels (RGB), Total Frames, Image Height, Image Width]
            const tensorShape = [1, 3, 75, 64, 128];
            const inputTensor = new ort.Tensor('float32', flatTensorData, tensorShape);

            // 4. Run Inference! (This is the heavy lifting)
            console.log("Running Model...");
            const results = await session.run({ input: inputTensor });

            // 5. Decode the raw probabilities into human-readable text
            const rawOutputArray = results.output.cpuData as Float32Array;
            const translation = decodeCTC(rawOutputArray);

            console.log("=== LIPNET TRANSLATION ===");
            console.log(translation.toUpperCase());
            console.log("==========================");

            setAppState('speaking');
        } catch (error) {
            console.error("AI Pipeline failed:", error);
            setAppState('done'); // Reset on failure
        }
    }

    // --- 5.5: Frame Processor (The "Eyes" of the app) ---
    
    /**
     * This runs up to 25 times per second on a dedicated C++ "Worklet" thread.
     * It CANNOT access standard React variables directly, which is why we use `useSharedValue`.
     */
    const frameOutput = useFrameOutput({
        pixelFormat: 'yuv',
        dropFramesWhileBusy: true,
        onFrame: (frame) => {
            'worklet'; // Marks this code to run on the separate UI thread
            
            // 1. Scan the frame for faces
            const faces = FaceDetector.detectFaces(frame);
            if (frame.width < 500 && frame.height < 500) return; // Wait for high-res frames
            
            const LipNetWidth = 128;
            const LipNetHeight = 64;

            try {
                frameWidth.value = frame.width;
                frameHeight.value = frame.height;
                
                const contours = faces[0]?.contours;
                if (!contours) return;

                // Extract just the lip coordinates
                const { UPPER_LIP_TOP, UPPER_LIP_BOTTOM, LOWER_LIP_TOP, LOWER_LIP_BOTTOM } = contours as any;

                if (UPPER_LIP_TOP?.length > 0 && LOWER_LIP_BOTTOM?.length > 0) {
                    
                    // -- A Note on Math & Scaling --
                    // The camera sensor outputs an image that has different dimensions than your physical screen.
                    // To draw a box over the lips on your screen, we must calculate a scaling factor and offsets.
                    const scale = Math.max(cameraDimensions.height / frameWidth.value);
                    const offsetX = (frameHeight.value * scale - cameraDimensions.width) / 2;
                    const offsetY = (frameWidth.value * scale - cameraDimensions.height) / 2;

                    const allLipPoints = [...UPPER_LIP_TOP, ...LOWER_LIP_BOTTOM];
                    
                    // Calculate head tilt (so we can rotate the crop box to stay flat against the lips)
                    const leftMostPoint = allLipPoints.reduce((min, p) => p.x < min.x ? p : min, allLipPoints[0]);
                    const rightMostPoint = allLipPoints.reduce((max, p) => p.x > max.x ? p : max, allLipPoints[0]);
                    tiltAmount.value = Math.atan2(rightMostPoint.y - leftMostPoint.y, rightMostPoint.x - leftMostPoint.x) * -1;

                    // Find the absolute center of the mouth
                    const topCenterPoint = UPPER_LIP_TOP[Math.floor(UPPER_LIP_TOP.length / 2)];
                    const bottomCenterPoint = LOWER_LIP_BOTTOM[Math.floor(LOWER_LIP_BOTTOM.length / 2)];
                    
                    const LipCenterX = ((topCenterPoint.x + bottomCenterPoint.x) / 2 * scale - offsetX);
                    const LipCenterY = ((topCenterPoint.y + bottomCenterPoint.y) / 2 * scale - offsetY);

                    // Update UI shared values for the red bounding box
                    mouthW.value = LipNetHeight;
                    mouthH.value = LipNetWidth;
                    mouthX.value = cameraDimensions.width - (LipCenterX - (LipNetWidth / 2) + LipNetWidth);
                    mouthY.value = LipCenterY - (LipNetHeight / 2);

                    // If user clicked "Start Capture", begin extracting and saving crops!
                    if (isCapturing.value) {
                        const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
                        const mouthXCrop = LipCenterX - (LipNetWidth / 2);
                        const mouthYCrop = LipCenterY - (LipNetHeight / 2);
                        
                        // Calculate percentage-based coordinates for the crop plugin
                        const leftRegion = ((cameraDimensions.width - mouthXCrop - offsetX - 70) / cameraDimensions.width * 100);
                        const topRegion = clamp(((cameraDimensions.height - mouthYCrop - 60) / cameraDimensions.height) * 100, 0, 100);

                        if (leftRegion > 0 && leftRegion < 100 && topRegion > 0 && topRegion < 100) {
                            const unflippedCrop = crop(frame, {
                                cropRegion: { left: leftRegion, top: topRegion, width: 17.7, height: 5 },
                                includeImageBase64: true,
                            });

                            // Ensure the image is oriented correctly
                            const finalImageBase64 = rotateImage(unflippedCrop.base64, 180);
                            
                            // `scheduleOnRN` pushes these tasks back to the main React thread
                            scheduleOnRN(setDebugPreview, finalImageBase64);
                            scheduleOnRN(saveFrameBuffer, finalImageBase64);
                        }
                    }
                }
            } catch (error) {
                console.error('Cropping Error: ', error);
            } finally {
                // VERY IMPORTANT: Always dispose of the frame memory, otherwise the app will crash instantly.
                frame.dispose();
            }
        }
    });

    // --- 5.6: UI Styles & Rendering ---

    // Animates the red rectangle over the user's lips in real-time
    const lipBoxStyle = useAnimatedStyle(() => ({
        position: 'absolute',
        borderWidth: 2,
        borderColor: 'lime', // Changed to lime for better visibility over red lips
        width: mouthH.value,
        height: mouthW.value,
        left: mouthX.value,
        top: mouthY.value,
        transform: [{ rotateZ: `${tiltAmount.value}rad` }]
    }));

    // Dynamic button props based on State Machine
    const getButtonProps = () => {
        switch (appState) {
            case 'idle': return { text: 'Start Capture', onPress: handleStartCapture };
            case 'capturing': return { text: 'Stop Capture', onPress: handleStopCapture };
            case 'inferencing': return { text: 'Analyzing Lips...', onPress: () => {} };
            case 'speaking': return { text: 'Speaking...', onPress: () => setAppState('done') };
            case 'done': return { text: 'Start Again', onPress: handleStartCapture };
            default: return { text: 'Unknown', onPress: () => {} };
        }
    };

    return (
        <View style={styles.container}>
            {hasPermission && cameraDevice ? (
                cameraMounted ? (
                    <>
                        <Camera
                            ref={camera}
                            isActive={true}
                            style={StyleSheet.absoluteFill}
                            outputs={[frameOutput, videoOutput]}
                            constraints={[{ resolutionBias: videoOutput }, { binned: true }, { fps: 25 }]} // LipNet demands 25fps
                            device={cameraDevice}
                            orientationSource={'device'}
                            onLayout={(e) => setCameraDimensions({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                        />

                        {/* Overlays */}
                        {appState === 'capturing' && <FrameProgressBar ref={progressRef} />}
                        <Animated.View style={lipBoxStyle} />
                        <CropPreview ref={previewRef} />

                        {/* Control Button */}
                        <View style={styles.buttonContainer}>
                            <Button title={getButtonProps().text} onPress={getButtonProps().onPress} />
                        </View>
                    </>
                ) : (
                    <Text style={styles.errorText}>Camera is NOT mounted</Text>
                )
            ) : (
                <Text style={styles.errorText}>No camera device or permission</Text>
            )}
        </View>
    );
}

// ==========================================
// SECTION 6: STYLES
// ==========================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'black'
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 60,
        backgroundColor: 'white',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 10,
        zIndex: 10
    },
    progressContainer: {
        position: 'absolute',
        bottom: 120,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: 8,
        padding: 10,
        zIndex: 10,
    },
    progressText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'black',
    },
    cropPreviewContainer: {
        position: 'absolute',
        top: 50,
        left: 20,
        zIndex: 999,
        borderWidth: 2,
        borderColor: "lime",
        backgroundColor: 'black'
    },
    cropPreviewText: {
        color: 'lime',
        fontSize: 10,
        textAlign: 'center'
    },
    cropPreviewImage: {
        width: 128,
        height: 64 
    },
    errorText: {
        width: '100%',
        backgroundColor: 'rgb(255,0,0)',
        textAlign: 'center',
        color: 'white',
        padding: 10
    }
});