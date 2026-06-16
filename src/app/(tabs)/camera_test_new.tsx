import { useEffect, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { Camera, CameraRef, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { runOnJS } from 'react-native-worklets-core';


type StateMachine = 
    'idle' // 0, camera is on and displaying preview, waiting for user to start recording
  | 'capturing' // 1, capturing frames, once 75 frames are reached, switch to intferencing state
  | 'inferencing' // 2, run SCRFD face & lip detection, once 75 valid frames, run LipNet interpretation, then switch to speaking state
  | 'speaking' // 3, dispaly LipNet results and use text-to-speech to speak the results, once done, switch back to idle state
  | 'done'; // 4, all done, waiting for user to start another recording




export default function CameraTest() {
  const { detectFaces } = useFaceDetector({
    trackingEnabled: true,
    landmarkMode: 'all',
    contourMode: 'all',
  });
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const cameraRef = useRef<CameraRef>(null);

  const [appState, setAppState] = useState<StateMachine>('idle');
  const [validFrameCount, setValidFrameCount] = useState<number>(0);

  // --- Effect: Request Permissions on Mount ---
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission]);

  // --- Safe State Updater for the Worklet ---
  const handleMouthDetected = () => {
    setValidFrameCount((prev) => {
      const next = prev + 1;
      if (next >= 75) {
        setAppState('inferencing'); // Transition state when cap is hit
        // Trigger LipNet ONNX processing here!
      }
      return next;
    });
  };

  // --- Button Handlers ---
  const handleStartCapture = () => {
    if (appState !== 'idle' && appState !== 'done') return;
    setAppState('capturing');
    setValidFrameCount(0);
  };

  const handleStopCapture = () => {
    if (appState !== 'capturing') return;
    setAppState('idle'); 
  };

// 2. The streamlined Frame Processor
const frameProcessor = useFrameProcessor((frame) => {
  'worklet';
  const faces = detectFaces(frame);

  if (faces.length > 0) {
    const mainFace = faces[0];

    // ML Kit literally hands you the exact mouth coordinates!
    const bottomLip = mainFace.contours.LOWER_LIP_BOTTOM;
    const topLip = mainFace.contours.UPPER_LIP_TOP;

    if (bottomLip && topLip) {
      console.log("Mouth found at:", topLip.x, topLip.y);
      
      // Tell your state machine to add a valid frame
      runOnJS(handleMouthDetected)();
    }
  }
}, []);

  // --- Dynamic UI Logic ---
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

  // --- Render Error State ---
  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="Grant Permission" /> 
      </View>
    );
  }

  if (!device) return <Text>Loading Camera...</Text>;

  // --- MAIN RENDER ---
  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={appState === 'idle' || appState === 'capturing'}
        frameProcessor={frameProcessor}
      />

      {/* Progress Bar (Only show when capturing) */}
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
  camera: {
    flex: 1,
    marginTop: 0,
    marginBottom: 50,
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





});
