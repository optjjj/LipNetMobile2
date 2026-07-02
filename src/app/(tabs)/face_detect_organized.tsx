// Face Detect Organized

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
    useFrameOutput,
    useCamera,
    Camera
} from 'react-native-vision-camera'
import {
    SafeAreaProvider,
    useSafeAreaInsets
} from 'react-native-safe-area-context'
import {
    Face,
    FaceDetectorOptions,
    useFaceDetector
} from 'react-native-vision-camera-face-detector'
import Animated, {
    useAnimatedStyle,
    useDerivedValue,
    withTiming
} from 'react-native-reanimated'
import {
    Skia,
    StrokeCap,
    Canvas,
    Points,
    Rect,
    SkPoint,
    Paint
} from '@shopify/react-native-skia'
import {
    useRunOnJS,
    useSharedValue
} from 'react-native-worklets-core'
import {
    crop
} from 'vision-camera-cropper'


// State Machine Definition

type StateMachine =
    'idle' // 0, camera is on and displaying preview, waiting for user to start recording
    | 'capturing' // 1, capturing frames, once 75 frames are reached, switch to intferencing state
    | 'inferencing' // 2, run SCRFD face & lip detection, once 75 valid frames, run LipNet interpretation, then switch to speaking state
    | 'speaking' // 3, display LipNet results and use text-to-speech to speak the results, once done, switch back to idle state
    | 'done'; // 4, all done, waiting for user to start another recording



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
        width, height
    } = useWindowDimensions()

    // Worklet
    const isCapturing = useSharedValue<boolean>(false);
    const safeLogPulse = useRunOnJS(() => console.log("worklet works!"), [])
    const logPulse = () => {
        console.log("worklet working")
    }

    // State Machine
    const [appState, setAppState] = useState<StateMachine>('idle');

    // Capturing phase

    const frameBuffer = useRef<any[]>([])
    const progressRef = useRef<ProgressBarRef>(null);
    const isProcessing = useSharedValue(false)

    const saveFrameBuffer = (base64MouthData: any) => {
        frameBuffer.current.push(base64MouthData)

        progressRef.current?.updateCount(frameBuffer.current.length)

        if (frameBuffer.current.length === 75) {
            console.log("75 Frames Captured")
            isCapturing.value = false
            setAppState('inferencing')
        }
    }

    // Startup

    const {
        hasPermission,
        requestPermission
    } = useCameraPermission()

    const [
        cameraMounted,
        setCameraMounted
    ] = useState<boolean>(true);

    const [
        autoMode,
        setAutoMode
    ] = useState<boolean>(true);

    const [
        cameraFacing,
        setCameraFacing
    ] = useState<Extract<CameraPosition, 'front' | 'back'>>('front')

    const cameraDevice = useCameraDevice(cameraFacing)

    const videoOutput = useVideoOutput({
        targetResolution: { width: 1280, height: 720 }
    })

    const camera = useRef<CameraRef>(null)

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
    const lipPoints = useSharedValue<{x: number, y: number}[]>([])



    // Face Detection

    const faceDetectorOptions = useRef<FaceDetectorOptions>({
        performanceMode: 'fast',
        runClassifications: false,
        runContours: true,
        runLandmarks: false,
        windowWidth: width,
        windowHeight: height
    }).current
    const FaceDetector = useFaceDetector(faceDetectorOptions)

    // State Helper Functions

    const handleStartCapture = () => {
        if (appState !== 'idle' && appState !== 'done') return;
        isCapturing.value = true
        setAppState('capturing')
    }

    const handleStopCapture = () => {
        if (appState !== 'capturing') return;
        isCapturing.value = false
        frameBuffer.current = []
        progressRef.current?.updateCount(0)
        setAppState('done')
        handleDoneState();
    }

    const handleDoneState = () => {
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

    // --------------- Worklet / Math Logic -------------------------

    const LipPoints = (contours: Record<string, { x: number; y: number }[]> | null | undefined) => {
        'worklet'

        if (!contours) return null;

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
            const SCALE_FACTOR = 1.65
            const X_OFFSET = ((width * SCALE_FACTOR - width) / 2)
            const Y_CORRECTION = 40

            // LIP TILT CALCULATION

            const leftMostPoint = allLipPoints.reduce((min, p) => p.x < min.x ? p : min, allLipPoints[0])
            const rightMostPoint = allLipPoints.reduce((max, p) => p.x > max.x ? p : max, allLipPoints[0])

            tiltAmount.value = Math.atan2(rightMostPoint.y - leftMostPoint.y, rightMostPoint.x - leftMostPoint.x) * 0.75

            const topCenterPoint = UPPER_LIP_TOP[Math.floor(UPPER_LIP_TOP.length / 2)]
            const bottomCenterPoint = LOWER_LIP_BOTTOM[Math.floor(LOWER_LIP_BOTTOM.length / 2)]

            const LipCenterX = ((topCenterPoint.x + bottomCenterPoint.x) / 2 * SCALE_FACTOR)
            const LipCenterY = ((topCenterPoint.y + bottomCenterPoint.y) / 2)



            const LipNetWidth = 128
            const LipNetHeight = 64

            mouthW.value = LipNetHeight
            mouthH.value = LipNetWidth
            mouthX.value = LipCenterX - X_OFFSET - LipNetWidth / 2
            mouthY.value = LipCenterY - Y_CORRECTION - LipNetHeight / 2

            // LIP CONTOUR DRAWING
            const pointsArray = allLipPoints.map(p => {
                const scaledX = p.x * SCALE_FACTOR
                const centeredX = scaledX - X_OFFSET
                return {
                    x: centeredX,
                    y: p.y - Y_CORRECTION
                }
            })

            return {
                points: pointsArray,
                boundingBox: {
                    width: LipNetWidth,
                    height: LipNetHeight,
                    x: mouthX.value,
                    y: mouthY.value
                },
                tilt: tiltAmount
            }

            // return allLipPoints.map(p => {
            //     const scaledX = p.x * SCALE_FACTOR
            //     const centeredX = scaledX - X_OFFSET
            //     return vec(centeredX, (p.y - Y_CORRECTION))
            // })
        }
    }


    const frameProcessor = useFrameOutput({
        onFrame: (frame) => {

            'worklet'
            // ---- Detects faces and isolates contours ---- 

            if (isProcessing.value === true) return

            isProcessing.value = true

            try {
            const faces = FaceDetector.detectFaces(frame)

            if (faces.length === 0) {
                isProcessing.value = false
                return
            }
            

            const contours = faces[0]?.contours
            if (!contours) {
                isProcessing.value = false
                return
            }

            // ---- Calls LipPoints to find face, mouth, and lips ----

            const LipReader = LipPoints(contours)
            if (!LipReader) {
                isProcessing.value = false    
                return
            }

            const {
                width,
                height,
                x,
                y,
            } = LipReader.boundingBox

            // frame.render()


            // Skia Face Rectangle Draw

            // const faceRect = Skia.XYWHRect(x, y, width, height)
            // const facePaint = Skia.Paint()
            // facePaint.setColor(Skia.Color('red'))

            aFaceX.value = x
            aFaceY.value = y
            aFaceW.value = width
            aFaceH.value = height
            // frame.drawRect(faceRect, facePaint)

            // Skia Mouth Rectangle Draw

            const mouthRect = Skia.XYWHRect(mouthX.value, mouthY.value, mouthH.value, mouthW.value)
            const mouthPaint = Skia.Paint()
            mouthPaint.setColor(Skia.Color('green'))

            mouthX.value = LipReader.boundingBox.x
            mouthY.value = LipReader.boundingBox.y
            mouthH.value = LipReader.boundingBox.height
            mouthW.value = LipReader.boundingBox.width
            // frame.drawRect(mouthRect, mouthPaint)

            lipPoints.value = LipReader.points

            // Skia Lip Circle Draw

            const lipPaint = Skia.Paint()
            lipPaint.setColor(Skia.Color('magneta'))
            lipPaint.setStrokeWidth(4)
            lipPaint.setStrokeCap(StrokeCap.Round)
            // for (let i = 0; i < LipPoints.length; i++) {
            //     const p = LipReader.points[i];
            //     frame.drawCircle(p.x, p.y, 2, lipPaint);
            // }
        }
        finally{
            isProcessing.value = false
        }

        }
    })










    return (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            {hasPermission && cameraDevice ? (
                <>
                    <Camera
                        ref={camera}
                        style={StyleSheet.absoluteFill}
                        constraints={[{ resolutionBias: videoOutput }, { binned: true }, { fps: 25 }]}
                        isActive={true}
                        device={cameraDevice}
                        orientationSource="device"
                        onError={(e) => console.error(e)}
                        //autoMode={true}
                        //cameraFacing="front"
                        outputs={[frameProcessor, videoOutput]}
                    //frameProcessor={frameProcessor}
                    />

                    <View style={styles.container}>
                        {appState === 'capturing' && <FrameProgressBar ref={progressRef} />}

                        <View style={styles.buttonContainer}>
                            <Button title={buttonProps().text} onPress={buttonProps().onPress} />
                        </View>
                    </View>

                    <Canvas style={StyleSheet.absoluteFill} pointerEvents = 'none'>
                        <Points
                            points={lipPoints}
                            mode='points'
                            color='cyan'
                            strokeWidth={4}
                            strokeCap={'round'}
                            />
                        <Rect
                        x = {aFaceX}
                        y = {aFaceY}
                        width = {aFaceW}
                        height = {aFaceH}>    
                        <Paint color='red' style = 'stroke' strokeWidth={2} />
                        </Rect>

                        <Rect
                        x = {mouthX}
                        y = {mouthY}
                        width = {mouthW}
                        height = {mouthH}>
                            <Paint color = 'blue' style = 'stroke' strokeWidth={2} />
                        </Rect>
                        
                            
                    </Canvas>
                </>
            ) : (
                <Text
                    style={{
                        width: '100%',
                        backgroundColor: 'rgb(255,0,0)',
                        textAlign: 'center',
                        color: 'white',
                    }}
                >
                    No camera device or permission
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({

    // CAMERA STLYES

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