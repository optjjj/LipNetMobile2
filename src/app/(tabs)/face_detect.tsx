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
  Camera,
  CameraPosition,
  CameraRef,
  useCameraDevice,
  useCameraPermission,
  useVideoOutput,
  useFrameOutput
} from 'react-native-vision-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Face,
  FaceDetectorOptions,
  useFaceDetector
} from 'react-native-vision-camera-face-detector'
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue
} from 'react-native-reanimated'
import { Canvas, Points, vec } from '@shopify/react-native-skia'
import { runOnJS } from 'react-native-worklets'
import { crop } from 'vision-camera-cropper'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type StateMachine =
    'idle'        // camera on, waiting for user to start recording
  | 'capturing'   // capturing frames; switches to inferencing at 75 frames
  | 'inferencing' // running lip detection; switches to speaking once done
  | 'speaking'    // TTS output; switches back to idle when done
  | 'done'        // finished, waiting for another recording

// ─────────────────────────────────────────────────────────────────────────────
// FrameProgressBar
// ─────────────────────────────────────────────────────────────────────────────

export interface ProgressBarRef {
  updateCount: (count: number) => void
}

const FrameProgressBar = forwardRef<ProgressBarRef, {}>((props, ref) => {
  const [count, setCount] = useState(0)

  useImperativeHandle(ref, () => ({
    updateCount: (newCount: number) => setCount(newCount)
  }))

  return (
    <View style={styles.progressContainer}>
      <Text style={styles.progressText}>Valid Frames: [{count}/75]</Text>
    </View>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// FaceDetectionScreen
// ─────────────────────────────────────────────────────────────────────────────

export default function FaceDetectionScreen(): ReactNode {
  const insets            = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()

  // ── state ──────────────────────────────────────────────────────────────────
  const [appState,      setAppState     ] = useState<StateMachine>('idle')
  const [cameraMounted, setCameraMounted] = useState<boolean>(true)
  const [cameraPaused,  setCameraPaused ] = useState<boolean>(false)
  const [cameraFacing,  setCameraFacing ] = useState<Extract<CameraPosition, 'front' | 'back'>>('front')

  // ── refs ───────────────────────────────────────────────────────────────────
  const camera      = useRef<CameraRef>(null)
  const frameBuffer = useRef<any[]>([])
  const progressRef = useRef<ProgressBarRef>(null)

  // ── permissions ────────────────────────────────────────────────────────────
  const { hasPermission, requestPermission } = useCameraPermission()

  useEffect(() => {
    if (!hasPermission) requestPermission()
  }, [hasPermission])

  // ── device ─────────────────────────────────────────────────────────────────
  const cameraDevice = useCameraDevice(cameraFacing)

  // ── face detector ──────────────────────────────────────────────────────────
  // Note: do NOT destructure useFaceDetector — hybrid objects lose their binding
  const faceDetectorOptions = useRef<FaceDetectorOptions>({
    performanceMode:    'fast',
    runClassifications: false,
    runContours:        true,
    runLandmarks:       false,
    windowWidth:        width,
    windowHeight:       height
  }).current

  const faceDetector = useFaceDetector(faceDetectorOptions)

  // ── shared values ──────────────────────────────────────────────────────────
  const isCapturing = useSharedValue<boolean>(false)

  const aFaceW = useSharedValue(0)
  const aFaceH = useSharedValue(0)
  const aFaceX = useSharedValue(0)
  const aFaceY = useSharedValue(0)

  // Note: mouthW stores the height value (64) and mouthH stores the width value (128).
  // The naming is intentionally preserved from the original to avoid breaking
  // anything downstream — just be aware when reading.
  const mouthW     = useSharedValue(0)
  const mouthH     = useSharedValue(0)
  const mouthX     = useSharedValue(0)
  const mouthY     = useSharedValue(0)
  const tiltAmount = useSharedValue(0)

  // Plain {x,y} objects — converted to Skia vec() in the derived value below
  const lipPoints = useSharedValue<{ x: number; y: number }[]>([])

  // ── frame buffer (defined before useFrameOutput for worklet closure capture) ─
  const saveFrameBuffer = (base64MouthData: any) => {
    frameBuffer.current.push(base64MouthData)
    progressRef.current?.updateCount(frameBuffer.current.length)

    if (frameBuffer.current.length === 75) {
      isCapturing.value = false
      setAppState('inferencing')
    }
  }

  // ── outputs ────────────────────────────────────────────────────────────────
  const videoOutput = useVideoOutput({
    targetResolution: { width: 1280, height: 720 }
  })

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    onFrame: (frame) => {
      'worklet'
      try {
        const detectedFaces = faceDetector.detectFaces(frame)

        if (detectedFaces.length === 0) {
          aFaceW.value = 0; aFaceH.value = 0
          aFaceX.value = 0; aFaceY.value = 0
          mouthW.value = 0; mouthH.value = 0
          mouthX.value = 0; mouthY.value = 0
          lipPoints.value = []
          return
        }


        const face     = detectedFaces[0]
        const contours = face.contours
        const SCALE_FACTOR_X = width / frame.width;
        const SCALE_FACTOR_Y = height / frame.height;

        aFaceW.value = face.bounds.width * SCALE_FACTOR_X
        aFaceH.value = face.bounds.height * SCALE_FACTOR_Y
        aFaceX.value = face.bounds.x * SCALE_FACTOR_X
        aFaceY.value = face.bounds.y * SCALE_FACTOR_Y

        if (!contours) {
          mouthW.value = 0; mouthH.value = 0
          mouthX.value = 0; mouthY.value = 0
          lipPoints.value = []
          return
        }

        const {
          UPPER_LIP_TOP,
          UPPER_LIP_BOTTOM,
          LOWER_LIP_TOP,
          LOWER_LIP_BOTTOM
        } = contours as Record<string, { x: number; y: number }[]>

        if (!UPPER_LIP_TOP?.length || !LOWER_LIP_BOTTOM?.length) return

        const allLipPoints = [
          ...UPPER_LIP_TOP,
          ...UPPER_LIP_BOTTOM,
          ...LOWER_LIP_TOP,
          ...LOWER_LIP_BOTTOM
        ]


        const X_OFFSET     = 0 //(width * SCALE_FACTOR - width) / 2
        const Y_CORRECTION = 0
        const LIP_NET_W    = 128
        const LIP_NET_H    = 64

        // Tilt
        const leftMost  = allLipPoints.reduce((m, p) => p.x < m.x ? p : m, allLipPoints[0])
        const rightMost = allLipPoints.reduce((m, p) => p.x > m.x ? p : m, allLipPoints[0])
        tiltAmount.value = Math.atan2(
          rightMost.y - leftMost.y,
          rightMost.x - leftMost.x
        ) * -0.75

        // Mouth crop region
        const topCenter    = UPPER_LIP_TOP[Math.floor(UPPER_LIP_TOP.length / 2)]
        const bottomCenter = LOWER_LIP_BOTTOM[Math.floor(LOWER_LIP_BOTTOM.length / 2)]
        const lipCenterX   = (topCenter.x + bottomCenter.x) / 2 * SCALE_FACTOR_X
        const lipCenterY   = (topCenter.y + bottomCenter.y) / 2 * SCALE_FACTOR_Y

        mouthH.value = LIP_NET_W
        mouthW.value = LIP_NET_H
        mouthX.value = lipCenterX - X_OFFSET - LIP_NET_W / 2
        mouthY.value = lipCenterY - Y_CORRECTION - LIP_NET_H / 2

        // Lip mesh points for Skia overlay
        lipPoints.value = allLipPoints.map(p => ({
          x: p.x * SCALE_FACTOR_X - X_OFFSET,
          y: p.y * SCALE_FACTOR_Y - Y_CORRECTION
        }))

        // Frame capture
        if (isCapturing.value && mouthX.value > 0) {
          const croppedResult = crop(frame, {
            cropRegion: {
              left:   mouthX.value,
              top:    mouthY.value,
              width:  mouthH.value,
              height: mouthW.value
            },
            includeImageBase64: true
          })
          runOnJS(saveFrameBuffer)(croppedResult)
        }

      } finally {
        frame.dispose()
      }
    }
  })

  // ── derived / animated values ──────────────────────────────────────────────
  const LipMeshPoints = useDerivedValue(() =>
    lipPoints.value.map(p => vec(p.x, p.y))
  )

  const boundingBoxStyle = useAnimatedStyle(() => ({
    position:          'absolute',
    borderWidth:       4,
    borderLeftColor:   'rgb(0,255,0)',
    borderRightColor:  'rgb(0,255,0)',
    borderBottomColor: 'rgb(0,255,0)',
    borderTopColor:    'rgb(0,255,0)',
    width:  aFaceW.value,
    height: aFaceH.value,
    left:   aFaceX.value,
    top:    aFaceY.value
  }))

  const lipBoxStyle = useAnimatedStyle(() => ({
    position:          'absolute',
    borderWidth:       4,
    borderLeftColor:   'rgb(255,0,0)',
    borderRightColor:  'rgb(255,0,0)',
    borderBottomColor: 'rgb(255,0,0)',
    borderTopColor:    'rgb(255,0,0)',
    width:     mouthH.value,
    height:    mouthW.value,
    left:      mouthX.value,
    top:       mouthY.value,
    transform: [{ rotateZ: `${tiltAmount.value}rad` }]
  }))

  // ── state machine ──────────────────────────────────────────────────────────
  const buttonProps = () => {
    switch (appState) {
      case 'idle':        return { text: 'Start Capture',    onPress: handleStartCapture }
      case 'capturing':   return { text: 'Stop Capture',     onPress: handleStopCapture }
      case 'inferencing': return { text: 'Analyzing Lips...', onPress: handleRestart }
      case 'speaking':    return { text: 'Speaking...',      onPress: handleRestart }
      case 'done':        return { text: 'Start Again',      onPress: handleStartCapture }
      default:            return { text: 'Unknown',          onPress: () => {} }
    }
  }

  // ── handlers ───────────────────────────────────────────────────────────────
  const handleStartCapture = () => {
    if (appState !== 'idle' && appState !== 'done') return
    frameBuffer.current = []
    progressRef.current?.updateCount(0)
    isCapturing.value = true
    setAppState('capturing')
  }

  const handleStopCapture = () => {
    if (appState !== 'capturing') return
    isCapturing.value = false
    frameBuffer.current = []
    progressRef.current?.updateCount(0)
    setAppState('done')
  }

  const handleRestart = () => {
    isCapturing.value = false
    frameBuffer.current = []
    progressRef.current?.updateCount(0)
    setAppState('done')
  }

  const handleCameraMountError = (error: any) => {
    console.error('camera mount error', error)
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <View style={[StyleSheet.absoluteFill, styles.centeredContainer]}>
        {hasPermission && cameraDevice ? (
          <>
            {cameraMounted && (
              <>
                <Camera
                  ref={camera}
                  style={StyleSheet.absoluteFill}
                  outputs={[videoOutput, frameOutput]}
                  constraints={[
                    { resolutionBias: videoOutput },
                    { binned: true },
                    { fps: 30 }
                  ]}
                  isActive={true}
                  device={cameraDevice}
                  orientationSource="device"
                  onError={handleCameraMountError}
                />

                <View style={styles.container}>
                  {appState === 'capturing' && (
                    <FrameProgressBar ref={progressRef} />
                  )}
                  <View style={styles.buttonContainer}>
                    <Button
                      title={buttonProps().text}
                      onPress={buttonProps().onPress}
                    />
                  </View>
                </View>

                <Animated.View style={boundingBoxStyle} />
                <Animated.View style={lipBoxStyle} />

                <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Points
                    points={LipMeshPoints}
                    mode="points"
                    color="cyan"
                    strokeWidth={4}
                    strokeCap="round"
                  />
                </Canvas>

                {cameraPaused && (
                  <Text style={styles.cameraPausedBanner}>
                    Camera is PAUSED
                  </Text>
                )}
              </>
            )}

            {!cameraMounted && (
              <Text style={styles.cameraNotMountedBanner}>
                Camera is NOT mounted
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.noPermissionBanner}>
            No camera device or permission
          </Text>
        )}
      </View>

      <View style={[styles.bottomBar, { bottom: 20 + insets.bottom }]}>
        <View style={styles.bottomRow} />
      </View>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centeredContainer: {
    alignItems:      'center',
    justifyContent:  'center'
  },
  container: {
    flex:            1,
    justifyContent:  'center'
  },
  buttonContainer: {
    position:        'absolute',
    bottom:          60,
    flexDirection:   'row',
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: 'white',
    width:           '20%',
    alignSelf:       'center',
    borderRadius:    16,
    paddingVertical: 10,
    overflow:        'hidden',
    zIndex:          10
  },
  progressContainer: {
    position:        'absolute',
    bottom:          10,
    left:            0,
    zIndex:          10,
    backgroundColor: 'white',
    width:           '50%',
    height:          40,
    paddingTop:      4
  },
  progressText: {
    position:        'absolute',
    bottom:          10,
    left:            0,
    textAlign:       'center',
    width:           '100%',
    fontSize:        12,
    color:           'green',
    zIndex:          10
  },
  bottomBar: {
    position:        'absolute',
    left:            0,
    right:           0,
    flexDirection:   'column'
  },
  bottomRow: {
    width:           '100%',
    flexDirection:   'row',
    justifyContent:  'space-around'
  },
  cameraPausedBanner: {
    width:           '100%',
    backgroundColor: 'rgb(0,0,255)',
    textAlign:       'center',
    color:           'white'
  },
  cameraNotMountedBanner: {
    width:           '100%',
    backgroundColor: 'rgb(255,255,0)',
    textAlign:       'center'
  },
  noPermissionBanner: {
    width:           '100%',
    backgroundColor: 'rgb(255,0,0)',
    textAlign:       'center',
    color:           'white'
  }
})
