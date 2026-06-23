import React, {
  ReactNode,
  useEffect,
  useRef,
  useState
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
  Frame
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
  withTiming
} from 'react-native-reanimated'

import {Canvas, Points, vec} from '@shopify/react-native-skia'
import { mayInitWithUrlAsync } from 'expo-web-browser'


type StateMachine = 
    'idle' // 0, camera is on and displaying preview, waiting for user to start recording
  | 'capturing' // 1, capturing frames, once 75 frames are reached, switch to intferencing state
  | 'inferencing' // 2, run SCRFD face & lip detection, once 75 valid frames, run LipNet interpretation, then switch to speaking state
  | 'speaking' // 3, display LipNet results and use text-to-speech to speak the results, once done, switch back to idle state
  | 'done'; // 4, all done, waiting for user to start another recording



    const buttonProps = () => {
    switch (appState) {
      case 'idle': return { text: 'Start Capture', onPress: handleStartCapture };
      case 'capturing': return { text: 'Stop Capture', onPress: handleStopCapture };
      case 'inferencing': return { text: 'Analyzing Lips...', onPress: () => {} }; 
      case 'speaking': return { text: 'Speaking...', onPress: () => {} };
      case 'done': return { text: 'Start Again', onPress: handleStartCapture };
      default: return { text: 'Unknown', onPress: () => {} };
    }
  };

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

function FaceDetection(): ReactNode {
  const insets = useSafeAreaInsets()
  const {
    width,
    height
  } = useWindowDimensions()
  const [appState, setAppState] = useState<StateMachine>('idle');
  const frameBuffer: any[] = []
  const [validFrameCount, setValidFrameCount] = useState<number>(0);
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
  
  const faceDetectorOptions = useRef<FaceDetectorOptions>( {
    performanceMode: 'fast',
    runClassifications: false,
    runContours: true,
    runLandmarks: false,
    windowWidth: width,
    windowHeight: height
  } ).current
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
      const SCALE_FACTOR = 1.6
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



  const boundingBoxStyle = useAnimatedStyle( () => ( {
    position: 'absolute',
    borderWidth: 4,
    borderLeftColor: 'rgb(0,255,0)',
    borderRightColor: 'rgb(0,255,0)',
    borderBottomColor: 'rgb(0,255,0)',
    borderTopColor: 'rgb(0,255,0)',
    width: withTiming( aFaceW.value, {
      duration: 100
    } ),
    height: withTiming( aFaceH.value, {
      duration: 100
    } ),
    left: withTiming( aFaceX.value, {
      duration: 100
    } ),
    top: withTiming( aFaceY.value, {
      duration: 100
    } )
  } ) )

  const lipBoxStyle = useAnimatedStyle (() =>({
    position: 'absolute',
    borderWidth: 4,
    borderLeftColor: 'rgb(255, 0, 0)',
    borderRightColor: 'rgb(255, 0, 0)',
    borderBottomColor: 'rgb(255, 0, 0)',
    borderTopColor: 'rgb(255, 0, 0)',

    width: withTiming( mouthH.value, {
      duration: 100
    } ),
    height: withTiming( mouthW.value, {
      duration: 100
    } ),
    left: withTiming( mouthX.value, {
      duration: 100
    } ),
    top: withTiming( mouthY.value, {
      duration: 100
    } ),
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
    console.log( 'handleFacesDetected - detected', faces.value.length, 'faces' )

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

    if (appState === 'capturing'){

      const croppedFrameData = 1
      //const croppedFrameData = extractPixels(frame, mouthBox)
      frameBuffer.push(croppedFrameData)
      setValidFrameCount(frameBuffer.length)

      if (frameBuffer.length >= 75){
        console.log("75 Frames Captured")
        setAppState('inferencing')
      }

      // send frameBuffer to LipNet, then clear it



    }

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
            outputs = {[videoOutput]}
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



async function loadLipNet(): void{

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


function saveFrameBuffer(): void {
  // Implement frame buffer saving logic here.
  

  if (frameBuffer.length === 75) { // end recording phase
    return
  }

}

  const handleStartCapture = () => {
    if (appState !== 'idle' && appState !== 'done') return;
    setAppState('capturing');
  };

  const handleStopCapture = () => {
    if (appState !== 'capturing') return;
    (frameBuffer as any[]).length = 0;
    setAppState('done')
    handleDoneState()
  };

  const handleDoneState = () => {
    // Reset/frameBuffer to empty array without changing its reference (works if frameBuffer is const)
    if (Array.isArray(frameBuffer) && frameBuffer.length > 0) {
      (frameBuffer as any[]).length = 0;
    }
  }

  const handleRestart = () => {

  }




export default function face_detect() {
    return (FaceDetection(),
      <View style = {styles.container}>
        {appState === 'capturing' && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>Valid Frames: [{validFrameCount}/75]</Text>
        </View>
      )}

      {/* Control Button */}
      <View style={styles.buttonContainer}>
        <Button title={buttonProps().text} onPress={buttonProps().onPress} />
      </View>
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
    width: '100%',
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
  }
})