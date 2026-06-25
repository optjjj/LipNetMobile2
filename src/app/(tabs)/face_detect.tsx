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
  withTiming,
} from 'react-native-reanimated'

import {Canvas, Points, vec} from '@shopify/react-native-skia'
import { useRunOnJS, useSharedValue} from 'react-native-worklets-core'
import {crop} from 'vision-camera-cropper'


type StateMachine = 
    'idle' // 0, camera is on and displaying preview, waiting for user to start recording
  | 'capturing' // 1, capturing frames, once 75 frames are reached, switch to intferencing state
  | 'inferencing' // 2, run SCRFD face & lip detection, once 75 valid frames, run LipNet interpretation, then switch to speaking state
  | 'speaking' // 3, display LipNet results and use text-to-speech to speak the results, once done, switch back to idle state
  | 'done'; // 4, all done, waiting for user to start another recording

/**
 * Entry point component
 *
 * @return {ReactNode} Component
 */
// function Index(): ReactNode {
//   return (
//     <SafeAreaProvider>
//       <NavigationContainer>
//         <FaceDetection />
//       </NavigationContainer>
//     </SafeAreaProvider>
//   )
// }

/**
 * Face detection component
 *
 * @return {ReactNode} Component
 */



export interface ProgressBarRef{
  updateCount: (count: number) => void;
}

const FrameProgressBar = forwardRef<ProgressBarRef, {}>((props, ref) => {
  const [count, setCount] = useState(0);

  useImperativeHandle(ref, () => ({
    updateCount: (newCount: number) => setCount(newCount),
  }))

  return (
    <View style = {styles.progressContainer}>
      <Text style = {styles.progressText}> Valid Frames: [{count}/75]</Text>
    </View>
  )
})


export default function FaceDetectionScreen(): ReactNode {
const insets = useSafeAreaInsets()
  const {
    width,
    height
  } = useWindowDimensions()
  const isCapturing = useSharedValue<boolean>(false);
  const safeLogPulse = useRunOnJS(() => console.log("worklet is working!!"), []);
  const [appState, setAppState] = useState<StateMachine>('idle');
  const frameBuffer = useRef<any[]>([])
  const progressRef = useRef<ProgressBarRef>(null);
  const {
    hasPermission,
    requestPermission
  } = useCameraPermission()
  const [
    cameraMounted,
    setCameraMounted
  ] = useState<boolean>( true )
  const [
    cameraPaused,
    setCameraPaused
  ] = useState<boolean>( false )
  const [
    autoMode,
    setAutoMode
  ] = useState<boolean>( true )
  const [
    cameraFacing,
    setCameraFacing
  ] = useState<Extract<CameraPosition, 'front' | 'back'>>( 'front' )

  const logPulse = () => {
    console.log("Worklet Working!")
  }
  
  const faceDetectorOptions = useRef<FaceDetectorOptions>( {
    performanceMode: 'fast',
    runClassifications: false,
    runContours: true,
    runLandmarks: false,
    windowWidth: width,
    windowHeight: height
  } ).current
  

    const buttonProps = () => {
    switch (appState) {
      case 'idle': return { text: 'Start Capture', onPress: handleStartCapture };
      case 'capturing': return { text: 'Stop Capture', onPress: handleStopCapture };
      case 'inferencing': return { text: 'Analyzing Lips...', onPress: handleRestart }; 
      case 'speaking': return { text: 'Speaking...', onPress: handleRestart};
      case 'done': return { text: 'Start Again', onPress: handleStartCapture };
      default: return { text: 'Unknown', onPress: () => {} };
    }
  };
//   const isFocused = useIsFocused()
//   const appState = useAppState()
//   const isCameraActive = (
//     !cameraPaused &&
//     isFocused &&
//     appState === 'active'
//   )
  const cameraDevice = useCameraDevice( cameraFacing )

  const videoOutput = useVideoOutput({
    targetResolution: {width: 1280, height:720}
  })
  const frameOutput = useFrameOutput({
  pixelFormat: 'yuv',
  enablePreviewSizedOutputBuffers: true,
  onFrame: (frame) => {
    'worklet';

    try {
      safeLogPulse();
      if (isCapturing.value === true){


        const croppedMouth = {
          left: mouthX.value,
          top: mouthY.value,
          width: mouthH.value,
          height: mouthW.value
        }

        const croppedResult = crop(frame, {
          cropRegion: croppedMouth,
          includeImageBase64: true,
        })


        // const croppedMouth = resize(frame, {
        //   scale: {width: 128, height: 64},
        //   crop: {
        //     x: mouthX.value,
        //     y: mouthY.value,
        //     width: mouthW.value,
        //     height: mouthH.value
        //   },
        //   pixelFormat: 'rgb',
        //   dataType: 'uint8'
        // })
        runOnJS(saveFrameBuffer)(croppedResult);

      }
      
    } finally{
      frame.dispose()
    }
  }
})
  //
  // vision camera ref
  //
  const camera = useRef<CameraRef>( null )
  //const { detectFaces } = useImageFaceDetector( faceDetectorOptions )
  //
  // face rectangle position
  //
  const faces = useSharedValue<Face[]>( [] )
  const aFaceW = useSharedValue( 0 )
  const aFaceH = useSharedValue( 0 )
  const aFaceX = useSharedValue( 0 )
  const aFaceY = useSharedValue( 0 )
  const mouthW = useSharedValue(0)
  const mouthH = useSharedValue(0)
  const mouthX = useSharedValue(0)
  const mouthY = useSharedValue(0)
  const tiltAmount = useSharedValue(0)

  
const saveFrameBuffer = (base64MouthData: any) => {
  // Implement frame buffer saving logic here.
  frameBuffer.current.push(base64MouthData)

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
    // Reset/frameBuffer to empty array without changing its reference (works if frameBuffer is const)
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


  const LipMeshPoints = useDerivedValue(()=>{
    if (faces.value.length === 0) return [];

    const contours = faces.value[0]?.contours;
    if (!contours) return [];

    const{
      UPPER_LIP_TOP,
      UPPER_LIP_BOTTOM,
      LOWER_LIP_TOP,
      LOWER_LIP_BOTTOM
    } = contours as Record<string, {x:number; y:number}[]>;

    if (UPPER_LIP_TOP?.length > 0 && LOWER_LIP_BOTTOM?.length > 0){
      const allLipPoints = [
        ...UPPER_LIP_TOP,
        ...UPPER_LIP_BOTTOM,
        ...LOWER_LIP_TOP,
        ...LOWER_LIP_BOTTOM
      ]
      const SCALE_FACTOR = 1.65
      const X_OFFSET = ((width * SCALE_FACTOR - width) / 2 )
      const Y_CORRECTION = 40

      // LIP TILT CALCULATION

      const leftMostPoint = allLipPoints.reduce((min, p) => p.x < min.x ? p:min, allLipPoints[0])
      const rightMostPoint = allLipPoints.reduce((max, p) => p.x > max.x ? p:max, allLipPoints[0])

      tiltAmount.value = Math.atan2(rightMostPoint.y - leftMostPoint.y, rightMostPoint.x - leftMostPoint.x) * 0.75

      const topCenterPoint = UPPER_LIP_TOP[Math.floor(UPPER_LIP_TOP.length / 2)]
      const bottomCenterPoint = LOWER_LIP_BOTTOM[Math.floor(LOWER_LIP_BOTTOM.length / 2)]

      const LipCenterX = ((topCenterPoint.x + bottomCenterPoint.x) / 2 * SCALE_FACTOR)
      const LipCenterY = ((topCenterPoint.y + bottomCenterPoint.y) / 2)



      const LipNetWidth = 128
      const LipNetHeight = 64

      mouthW.value = LipNetHeight
      mouthH.value = LipNetWidth
      mouthX.value = LipCenterX - X_OFFSET - LipNetWidth/2 
      mouthY.value = LipCenterY - Y_CORRECTION - LipNetHeight/2 


      // LIP CONTOUR DRAWING

      return allLipPoints.map(p=>{
        const scaledX = p.x * SCALE_FACTOR
        const centeredX = scaledX - X_OFFSET
        return vec(centeredX, (p.y-Y_CORRECTION))
      })
    }    
    return []
  })



  const boundingBoxStyle = useAnimatedStyle( () => ( { // face box
    position: 'absolute',
    borderWidth: 4,
    borderLeftColor: 'rgb(0,255,0)',
    borderRightColor: 'rgb(0,255,0)',
    borderBottomColor: 'rgb(0,255,0)',
    borderTopColor: 'rgb(0,255,0)',
    width: aFaceW.value,
    height: aFaceH.value,
    left: aFaceX.value,
    top: aFaceY.value

    // width: withTiming( aFaceW.value, {
    //   duration: 100
    // } ),
    // height: withTiming( aFaceH.value, {
    //   duration: 100
    // } ),
    // left: withTiming( aFaceX.value, {
    //   duration: 100
    // } ),
    // top: withTiming( aFaceY.value, {
    //   duration: 100
    // } )
  } ) )

  const lipBoxStyle = useAnimatedStyle (() =>({ // lip box
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
      {rotateZ: `${tiltAmount.value}rad`,}
    ] 

  }))

    useEffect(() =>{
        if (!hasPermission){
            requestPermission()
        }
    }, [hasPermission])

  /**
   * Hanldes camera mount error event
   *
   * @param {any} error Error event
   */
  function handleCameraMountError(
    error: any
  ) {
    console.error( 'camera mount error', error )
  }

  /**
   * Handle detection result
   * 
   * @param {Face[]} detectedFaces Detection result 
   * @returns {void}
   */
  function handleFacesDetected(
    detectedFaces: Face[]
  ): void {
    faces.value = detectedFaces
    //console.log( 'handleFacesDetected - detected', faces.value.length, 'faces' )

    // if no faces are detected we do nothing
    if ( faces.value.length <= 0 ) {
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

    const { bounds } = faces.value[ 0 ]
    const {
      width,
      height,
      x,
      y, 
    } = bounds
    const { contours } = faces.value[0]

    if (!contours){
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


    // if (appState === 'capturing'){
    //   // Use runOnJS to log from a worklet safely to the JS thread
    //   const _logFromJS = (msg: string) => {
    //     console.log(msg)
    //   }

    //   const _logWorklet = () => {
    //     'worklet';
    //     // runOnJS is required to invoke JS functions from a worklet
    //     // so that logging and other JS-side effects run on the JS thread
    //     runOnJS(_logFromJS)('Worklet running from inside handleFacesDetected!')
    //   }

    //   _logWorklet()
    // }







    const saveFrame = (croppedData: any) => {
      frameBuffer.current.push(croppedData)

  
        progressRef.current?.updateCount(frameBuffer.current.length)
      
        if (frameBuffer.current.length === 75){
          console.log("75 Frames Captured!")
          isCapturing.value = false
          setAppState('inferencing')
        }
    }





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
  return ( <>
    <View
      style={ [
        StyleSheet.absoluteFill, {
          alignItems: 'center',
          justifyContent: 'center'
        }
      ] }
    >
      { hasPermission && cameraDevice ? <>
        { cameraMounted && <>
          <Camera
            ref={ camera }
            style={ StyleSheet.absoluteFill }
            outputs = {[frameOutput, videoOutput]}
            constraints={[
              {resolutionBias: videoOutput},
              {binned: true},
              {fps: 30}
            ]}
            isActive={ true }
            device={ cameraDevice }
            orientationSource={ 'device' }
            onError={ handleCameraMountError }
            onFacesDetected={ handleFacesDetected }
            { ...faceDetectorOptions }
            autoMode={ true }
            cameraFacing={ 'front' }
          
          />
        <View style = {styles.container}>
        {appState === 'capturing' && (
          <FrameProgressBar ref = {progressRef} />
      )}

      {/* Control Button */}
      <View style={styles.buttonContainer}>
        <Button title={buttonProps().text} onPress={buttonProps().onPress} />
      </View>
      </View>

          <Animated.View
            style={ boundingBoxStyle}
          />
          <Animated.View
            style = {lipBoxStyle}
          />

          <Canvas style = {StyleSheet.absoluteFill} pointerEvents='none'>
            <Points
              points = {LipMeshPoints}
              mode = 'points'
              color = 'cyan'
              strokeWidth={4}
              strokeCap={'round'}
              />
          </Canvas>

          { cameraPaused && <Text
            style={ {
              width: '100%',
              backgroundColor: 'rgb(0,0,255)',
              textAlign: 'center',
              color: 'white'
            } }
          >
            Camera is PAUSED
          </Text> }
        </> }

        { !cameraMounted && <Text
          style={ {
            width: '100%',
            backgroundColor: 'rgb(255,255,0)',
            textAlign: 'center'
          } }
        >
          Camera is NOT mounted
        </Text> }
      </> : <Text
        style={ {
          width: '100%',
          backgroundColor: 'rgb(255,0,0)',
          textAlign: 'center',
          color: 'white'
        } }
      >
        No camera device or permission
      </Text> }
    </View>

    <View
      style={ {
        position: 'absolute',
        bottom: 20 + + insets.bottom,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column'
      } }
    >
      <View
        style={ {
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-around'
        } }
      >
      </View>
    </View>
  </> );
}

function loadLipNet(): void{

}

function beginRecordingPhase(): void{

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