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
  useCameraPermission
} from 'react-native-vision-camera'
import {
  SafeAreaProvider,
  useSafeAreaInsets
} from 'react-native-safe-area-context'
import {
  Camera,
  Face,
  useImageFaceDetector,
  FaceDetectorOptions
} from 'react-native-vision-camera-face-detector'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'

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
    runLandmarks: true,
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
  const mouthRight = useSharedValue(0)
  const mouthLeft = useSharedValue(0)
  const mouthTop = useSharedValue(0)
  const mouthBottom = useSharedValue(0)
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
    top: withTiming( mouthRight.value, {
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
    width: withTiming( mouthLeft.value, {
      duration: 100
    } ),
    height: withTiming( mouthTop.value, {
      duration: 100
    } ),
    left: withTiming( mouthBottom.value, {
      duration: 100
    } ),
    top: withTiming( aFaceY.value, {
      duration: 100
    } )

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

    if (!contours) return;

        const {
            UPPER_LIP_TOP,
            LOWER_LIP_BOTTOM
        } = contours as Record<string, {x:number; y:number}[]>;

        if (UPPER_LIP_TOP.length > 0 && LOWER_LIP_BOTTOM.length > 0) {
            const allLipPoints = [...UPPER_LIP_TOP, ...LOWER_LIP_BOTTOM];

            const minX = Math.min(...allLipPoints.map(p => p.x))
            const maxX = Math.max(...allLipPoints.map(p=> p.x));
            const minY = Math.min(...allLipPoints.map(p=> p.y));
            const maxY = Math.max(...allLipPoints.map(p=>p.y));

            const mouthWidth = maxX - minX;
            const mouthHeight = maxY - minY;

            mouthRight.value = maxX
            mouthLeft.value = minX
            mouthTop.value = maxY
            mouthBottom.value = minY

        }
    

    aFaceW.value = width
    aFaceH.value = height
    aFaceX.value = x
    aFaceY.value = y







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


export default function face_detect() {
    return FaceDetection();
}