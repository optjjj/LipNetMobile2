// Face Detect OLD

import React, {
    ReactNode,
    useEffect,
    useRef,
    useState,
    forwardRef,
    useImperativeHandle
} from 'react'
import {
    StyleSheet,
    Text,
    Button,
    View,
    useWindowDimensions
} from 'react-native'
import {
    CameraPosition,
    CameraRef,
    useCameraDevice,
    useCameraPermission,
    useVideoOutput,
    Frame,
    useFrameOutput
} from 'react-native-vision-camera'
import {
    SafeAreaProvider,
    useSafeAreaInsets
} from 'react-native-safe-area-context'
import {
    Camera,
    Face,
    FaceDetectorOptions,
} from 'react-native-vision-camera-face-detector'
import Animated, {
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated'
import { Canvas, Points, vec } from '@shopify/react-native-skia'
import { crop, CropResult } from 'vision-camera-cropper'
import { scheduleOnRN } from 'react-native-worklets'


// State Machine Definition

type StateMachine =
    'idle'          // 0, camera is on and displaying preview, waiting for user to start recording
    | 'capturing'   // 1, capturing frames, once 75 frames are reached, switch to inferencing state
    | 'inferencing' // 2, run SCRFD face & lip detection, once 75 valid frames, run LipNet interpretation, then switch to speaking state
    | 'speaking'    // 3, display LipNet results and use text-to-speech to speak the results, once done, switch back to idle state
    | 'done';       // 4, all done, waiting for user to start another recording


// Progress Bar Logic

export interface ProgressBarRef {
    updateCount: (count: number) => void;
}

const FrameProgressBar = forwardRef<ProgressBarRef, {}>((props, ref) => {
    const [count, setCount] = useState(0);

    useImperativeHandle(ref, () => ({
        updateCount: (newCount: number) => setCount(newCount),
    }))

    return (
        <View style={styles.progressContainer}>
            <Text style={styles.progressText}> Valid Frames: [{count}/75]</Text>
        </View>
    )
})


// Main Export Function Loop

export default function FaceDetectionScreen(): ReactNode {

    //----------------- CONSTANT DEFINITIONS -----------------------

    // Dimensions
    const insets = useSafeAreaInsets()
    const {
        width,
        height
    } = useWindowDimensions()

    const frameWidth = useSharedValue(720)
    const frameHeight = useSharedValue(1280)

    // State Machine
    const [appState, setAppState] = useState<StateMachine>('idle');

    // Capturing Phase
    const frameBuffer = useRef<any[]>([])
    const isCapturing = useSharedValue<boolean>(false);
    const progressRef = useRef<ProgressBarRef>(null);

    // Startup
    const {
        hasPermission,
        requestPermission
    } = useCameraPermission()

    const [
        cameraMounted,
        setCameraMounted
    ] = useState<boolean>(true)

    const [
        cameraPaused,
        setCameraPaused
    ] = useState<boolean>(false)

    const [
        autoMode,
        setAutoMode
    ] = useState<boolean>(true)

    const [
        cameraFacing,
        setCameraFacing
    ] = useState<Extract<CameraPosition, 'front' | 'back'>>('front')

    const cameraDevice = useCameraDevice(cameraFacing)

    const videoOutput = useVideoOutput({
        targetResolution: { width: 500, height: 1000 }
    })

    // Vision Camera ref
    const camera = useRef<CameraRef>(null)
    //const { detectFaces } = useImageFaceDetector( faceDetectorOptions )

    // Face Detection

    const faceDetectorOptions = useRef<FaceDetectorOptions>({
        performanceMode: 'fast',
        runClassifications: false,
        runContours: true,
        runLandmarks: false,
        windowWidth: width,
        windowHeight: height
    }).current

    type CropValue = { left: number, top: number, width: number, height: number }

    // Shared values for face and mouth overlay positions — updated from JS thread detection callback,
    // read by animated styles and the Skia canvas overlay
    const faces = useSharedValue<Face[]>([])
    const aFaceW = useSharedValue(0)
    const aFaceH = useSharedValue(0)
    const aFaceX = useSharedValue(0)
    const aFaceY = useSharedValue(0)
    const mouthW = useSharedValue(0)
    const mouthH = useSharedValue(0)
    const mouthX = useSharedValue(0)
    const mouthY = useSharedValue(0)
    const tiltAmount = useSharedValue(0)
    const doneCropping = useSharedValue(false)

    const sayHello = (name) => {
        console.log(`Hello ${name}, I am running on the JS Thread!`)
    }

    const cropRegionShared = useSharedValue<CropValue>({ left: 0, top: 0, width: 128, height: 64 })

    // State Helper Functions

    // Pushes a cropped mouth frame into the buffer; transitions to inferencing once 75 frames are collected
    const saveFrameBuffer = (base64MouthData: CropResult) => {
        console.log("saveFrameBuffer is being called")
        const framelength = frameBuffer.current.push(base64MouthData)
        console.log("Length of frameBuffer: ", framelength)
        progressRef.current?.updateCount(frameBuffer.current.length)

        if (frameBuffer.current.length === 75) { // end recording phase
            console.log("75 Frames Captured")
            isCapturing.value = false
            setAppState('inferencing')
        }
    }

    const handleStartCapture = () => {
        if (appState !== 'idle' && appState !== 'done') return;
        isCapturing.value = true
        setAppState('capturing');
    };

    const handleStopCapture = () => {
        if (appState !== 'capturing') return;
        isCapturing.value = false
        frameBuffer.current = []
        progressRef.current?.updateCount(0)
        setAppState('done')
        handleDoneState()
    };

    const handleDoneState = () => {
        // Reset frameBuffer to empty array without changing its reference (works if frameBuffer is const)
        if (Array.isArray(frameBuffer) && frameBuffer.current.length > 0) {
            frameBuffer.current = []
        }
        progressRef.current?.updateCount(0)
        isCapturing.value = false
    }

    const handleRestart = () => {
        setAppState('done')
        handleDoneState()
    }

    // Buttons

    const buttonProps = () => {
        switch (appState) {
            case 'idle': return { text: 'Start Capture', onPress: handleStartCapture };
            case 'capturing': return { text: 'Stop Capture', onPress: handleStopCapture };
            case 'inferencing': return { text: 'Analyzing Lips...', onPress: handleRestart };
            case 'speaking': return { text: 'Speaking...', onPress: handleRestart };
            case 'done': return { text: 'Start Again', onPress: handleStartCapture };
            default: return { text: 'Unknown', onPress: () => { } };
        }
    };

    // --------------- Animated / Derived Value Logic -------------------------

    // Derives real-time lip contour points from the faces shared value.
    // Scales coordinates to match screen space, computes the LipNet mouth bounding box,
    // and applies a tilt correction so the crop tracks head rotation.
    const LipMeshPoints = useDerivedValue(() => {
        // scheduleOnRN((greeting) => console.log(greeting), "Hello from RN Runtime");
        // scheduleOnRN(sayHello, "hello")
        if (faces.value.length === 0) return [];

        const contours = faces.value[0]?.contours;
        if (!contours) return [];

        const {
            UPPER_LIP_TOP,
            UPPER_LIP_BOTTOM,
            LOWER_LIP_TOP,
            LOWER_LIP_BOTTOM
        } = contours as Record<string, { x: number; y: number }[]>;

        if (UPPER_LIP_TOP?.length > 0 && LOWER_LIP_BOTTOM?.length > 0) {
            const allLipPoints = [
                ...UPPER_LIP_TOP,
                ...UPPER_LIP_BOTTOM,
                ...LOWER_LIP_TOP,
                ...LOWER_LIP_BOTTOM
            ]

            // Scale Factors
            // const scaleFactorX = (screen.width / width)
            // const scaleFactorY = (screen.height / height)

            const additionalYOffset = 45

            const scale = Math.max(width / frameWidth.value, height / frameHeight.value);
            const offsetX = (frameWidth.value * scale - width) / 2 + 100;
            const offsetY = (frameHeight.value * scale - height) / 2 + additionalYOffset;


            // LIP TILT CALCULATION

            const leftMostPoint = allLipPoints.reduce((min, p) => p.x < min.x ? p : min, allLipPoints[0])
            const rightMostPoint = allLipPoints.reduce((max, p) => p.x > max.x ? p : max, allLipPoints[0])

            tiltAmount.value = Math.atan2(rightMostPoint.y - leftMostPoint.y, rightMostPoint.x - leftMostPoint.x) * -0.75

            const topCenterPoint = UPPER_LIP_TOP[Math.floor(UPPER_LIP_TOP.length / 2)]
            const bottomCenterPoint = LOWER_LIP_BOTTOM[Math.floor(LOWER_LIP_BOTTOM.length / 2)]

            const LipCenterX = ((topCenterPoint.x + bottomCenterPoint.x) / 2 * scale - offsetX + 40)
            const LipCenterY = ((topCenterPoint.y + bottomCenterPoint.y) / 2 * scale - offsetY + 40)

            const LipNetWidth = 128
            const LipNetHeight = 64

            mouthW.value = LipNetHeight
            mouthH.value = LipNetWidth
            mouthX.value = (LipCenterX - LipNetWidth / 2) - width
            mouthY.value = LipCenterY - offsetY - LipNetHeight / 2

            cropRegionShared.value = {
                left: (LipCenterX - LipNetWidth / 2) - width,
                top: LipCenterY - offsetY - LipNetHeight / 2,
                width: LipNetHeight,
                height: LipNetWidth
            }

            mouthX.value = width - LipCenterX

            // LIP CONTOUR DRAWING

            return allLipPoints.map(p => {
                const scaledX = p.x * scale
                const centeredX = scaledX - offsetX
                const mirroredX = width - centeredX
                const centeredY = p.y * scale - offsetY
                return vec(mirroredX, centeredY)
            })
        }
        return []
    })

    // Animated style for the face bounding box overlay (green border)
    // const boundingBoxStyle = useAnimatedStyle(() => ({ // face box
    //     position: 'absolute',
    //     borderWidth: 4,
    //     borderLeftColor: 'rgb(0,255,0)',
    //     borderRightColor: 'rgb(0,255,0)',
    //     borderBottomColor: 'rgb(0,255,0)',
    //     borderTopColor: 'rgb(0,255,0)',
    //     width: aFaceW.value,
    //     height: aFaceH.value,
    //     left: aFaceX.value,
    //     top: aFaceY.value

    //     // width: withTiming( aFaceW.value, {
    //     //   duration: 100
    //     // } ),
    //     // height: withTiming( aFaceH.value, {
    //     //   duration: 100
    //     // } ),
    //     // left: withTiming( aFaceX.value, {
    //     //   duration: 100
    //     // } ),
    //     // top: withTiming( aFaceY.value, {
    //     //   duration: 100
    //     // } )
    // }))

    // Animated style for the lip/mouth bounding box overlay (red border),
    // rotated by tiltAmount to track head tilt — this defines the LipNet crop region
    const lipBoxStyle = useAnimatedStyle(() => ({ // lip box
        position: 'absolute',
        borderWidth: 4,
        borderLeftColor: 'rgb(255, 0, 0)',
        borderRightColor: 'rgb(255, 0, 0)',
        borderBottomColor: 'rgb(255, 0, 0)',
        borderTopColor: 'rgb(255, 0, 0)',
        width: mouthH.value,
        height: mouthW.value,
        left: mouthX.value,
        top: mouthY.value,

        // width: withTiming( mouthH.value, {
        //   duration: 100
        // } ),
        // height: withTiming( mouthW.value, {
        //   duration: 100
        // } ),
        // left: withTiming( mouthX.value, {
        //   duration: 100
        // } ),
        // top: withTiming( mouthY.value, {
        //   duration: 100
        // } ),
        transform: [
            { rotateZ: `${tiltAmount.value}rad` }
        ]
    }))

    // Request camera permission on mount if not already granted
    useEffect(() => {
        if (!hasPermission) {
            requestPermission()
        }
    }, [hasPermission])

    // Handles camera mount error events
    function handleCameraMountError(error: any) {
        console.error('camera mount error', error)
    }

    // Callback from Camera's onFacesDetected prop (JS thread).
    // Updates all face position and lip contour shared values, then
    // manages frame capture to build the buffer for LipNet inference.
    function handleFacesDetected(detectedFaces: Face[]): void {
        faces.value = detectedFaces
        //console.log( 'handleFacesDetected - detected', faces.value.length, 'faces' )

        // If no faces detected, zero out all overlay shared values to hide the overlays
        if (faces.value.length <= 0) {
            aFaceW.value = 0
            aFaceH.value = 0
            aFaceX.value = 0
            aFaceY.value = 0
            mouthH.value = 0
            mouthW.value = 0
            mouthX.value = 0
            mouthY.value = 0
            return
        }

        const { bounds } = faces.value[0]
        const {
            width,
            height,
            x,
            y,
        } = bounds
        const { contours } = faces.value[0]

        if (!contours) {
            mouthH.value = 0;
            mouthW.value = 0;
            mouthX.value = 0;
            mouthY.value = 0;
            return;
        }

        aFaceW.value = width
        aFaceH.value = height
        aFaceX.value = x
        aFaceY.value = y

        // Saves a cropped mouth frame to the buffer; triggers inferencing once 75 frames are captured


        // Commented-out frame output: crops the mouth region per frame using the resize plugin,
        // encodes as base64 rgb, and hands off to saveFrameBuffer for LipNet inference


        // if (appState === 'capturing'){

        //   const croppedFrameData = 1
        //   frameBuffer.current.push(croppedFrameData)
        //   //const croppedFrameData = extractPixels(frame, mouthBox)

        //   progressRef.current?.updateCount(frameBuffer.current.length);

        //   if (frameBuffer.current.length >= 75){
        //     console.log("75 Frames Captured")
        //     setAppState('inferencing')
        //   }
        // }
        // send frameBuffer to LipNet, then clear it
    }
            const saveFrame = (croppedData: any) => {
            frameBuffer.current.push(croppedData)

            progressRef.current?.updateCount(frameBuffer.current.length)

            if (frameBuffer.current.length === 75) {
                console.log("75 Frames Captured!")
                isCapturing.value = false
                setAppState('inferencing')
            }
        }

    // const FrameOnJS = useRunOnJS((cropData: CropResult) => {
    //     // if (typeof cropData !== 'string'){
    //     //     return;
    //     // }
    //     saveFrameBuffer(cropData)
    // }, [])



    const frameOutput = useFrameOutput({
        pixelFormat: 'yuv',
        onFrame: (frame) => {
            'worklet';
            console.log("frameoutput is being entered at least")
            scheduleOnRN(sayHello, "hello")
            try {
                frameWidth.value = frame.width;
                frameHeight.value = frame.height;
                isCapturing.value = false
                const result = crop(frame, {
                    cropRegion: cropRegionShared.value,
                    includeImageBase64: true,
                });
                //scheduleOnRN(saveFrameBuffer, result)

                scheduleOnRN(sayHello, "CROP HAS SUCCESSFULLY RUN")

                //   if (isCapturing.value === true && mouthW.value > 0){
                //     const croppedMouth = resize(frame, {
                //       scale: {width: 128, height: 64},
                //       crop: {
                //         x: mouthX.value,
                //         y: mouthY.value,
                //         width: mouthW.value,
                //         height: mouthH.value
                //       },
                //       pixelFormat: 'rgb',
                //       dataType: 'base64'
                //     })
                //     runOnJS(saveFrameBuffer)(croppedMouth);
            }
            catch (error) {
                console.error('Cropping Error: ${error.message}')
            }
            finally {
                frame.dispose()
            }
        }
    })

    return (
        <>
            <View
                style={[
                    StyleSheet.absoluteFill, {
                        alignItems: 'center',
                        justifyContent: 'center'
                    }
                ]}
            >
                {hasPermission && cameraDevice ? (
                    <>
                        {cameraMounted && (
                            <>
                                <Camera
                                    ref={camera}
                                    isActive={true}
                                    style={StyleSheet.absoluteFill}
                                    outputs={[videoOutput, frameOutput]}
                                    constraints={[
                                        { resolutionBias: videoOutput },
                                        { binned: true },
                                        { fps: 25 }
                                    ]}
                                    

                                    device={cameraDevice}
                                    orientationSource={'device'}
                                    onError={handleCameraMountError}
                                    onFacesDetected={handleFacesDetected}
                                    {...faceDetectorOptions}
                                    autoMode={false}
                                    cameraFacing={'front'}
                                    resizeMode='cover'
                                />

                                <View style={styles.container}>
                                    {appState === 'capturing' && (
                                        <FrameProgressBar ref={progressRef} />
                                    )}

                                    {/* Control Button */}
                                    <View style={styles.buttonContainer}>
                                        <Button title={buttonProps().text} onPress={buttonProps().onPress} />
                                    </View>
                                </View>

                                {/* Animated face and lip bounding box overlays */}
                                {/* <Animated.View style={boundingBoxStyle} /> */}
                                <Animated.View style={lipBoxStyle} />

                                {/* Skia canvas for lip contour point visualization */}
                                <Canvas style={StyleSheet.absoluteFill} pointerEvents='none'>
                                    <Points
                                        points={LipMeshPoints}
                                        mode='points'
                                        color='cyan'
                                        strokeWidth={4}
                                        strokeCap={'round'}
                                    />
                                </Canvas>

                                {cameraPaused && (
                                    <Text
                                        style={{
                                            width: '100%',
                                            backgroundColor: 'rgb(0,0,255)',
                                            textAlign: 'center',
                                            color: 'white'
                                        }}
                                    >
                                        Camera is PAUSED
                                    </Text>
                                )}
                            </>
                        )}

                        {!cameraMounted && (
                            <Text
                                style={{
                                    width: '100%',
                                    backgroundColor: 'rgb(255,255,0)',
                                    textAlign: 'center'
                                }}
                            >
                                Camera is NOT mounted
                            </Text>
                        )}
                    </>
                ) : (
                    <Text
                        style={{
                            width: '100%',
                            backgroundColor: 'rgb(255,0,0)',
                            textAlign: 'center',
                            color: 'white'
                        }}
                    >
                        No camera device or permission
                    </Text>
                )}
            </View>

            {/* Bottom control bar — reserved for future camera controls */}
            <View
                style={{
                    position: 'absolute',
                    bottom: 20 + +insets.bottom,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                <View
                    style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-around'
                    }}
                >
                </View>
            </View>
        </>
    );
}


// Stub: Loads and initializes the LipNet inference model
function loadLipNet(): void {

}

// Stub: Begins the frame capture recording phase
function beginRecordingPhase(): void {

}


// const handleButtonPress = () => {
//   if (appState === 'idle'){
//     handleStartCapture();
//   }
//   if (appState === 'capturing'){
//     handleStopCapture();
//   }
//   if (appState === 'speaking'){
//     handleSpeaking();
//   }
//   if (appState === 'done'){
//     handleReset();
//   }
// }


const styles = StyleSheet.create({

    // CAMERA STYLES

    container: {
        flex: 1,
        justifyContent: 'center',
    },
    message: {
        textAlign: 'center',
        paddingBottom: 10,
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 60,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'white',
        width: '20%',
        alignSelf: 'center',
        borderRadius: 16,
        paddingVertical: 10,
        overflow: 'hidden',
        zIndex: 10
    },
    button: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    recordDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#cd5151',
        marginTop: 6,
        marginBottom: 4,
    },
    text: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
    },

    // PROGRESS BAR STYLES

    progressContainer: {
        position: 'absolute',
        bottom: 10,
        left: 0,
        zIndex: 10,
        backgroundColor: 'white',
        width: '50%',
        height: 40,
        paddingTop: 4,
    },

    progressText: {
        position: 'absolute',
        bottom: 10,
        left: 0,
        textAlign: 'center',
        width: '100%',
        fontSize: 12,
        color: 'green',
        zIndex: 10
    }
})
