import { CameraType } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, CameraRef, useCameraDevice, useCameraPermission, useVideoOutput } from 'react-native-vision-camera';

export default function CameraTest() {
  const [facing, setFacing] = useState<CameraType>('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const cameraRef = useRef<CameraRef>(null);
  const [recording, setRecording] = useState<boolean>(false);
  const [validFrameCount, setValidFrameCount] = useState<number>(0);
  const device = useCameraDevice('front');
  const videoOutput = useVideoOutput();

  
useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission]);

  if (!hasPermission) {
    return <Text style={styles.message}>We need your permission to show the camera</Text>;
  }


  function handleRecordButton() {
    if (recording) {
      stopRecording();
    } else {
      startRecording({ maxDuration: 8 });
    }
  }

async function saveToGallery(tempUri: string) {
  if (!mediaPermission?.granted) {
    const { granted } = await requestMediaPermission();
    if (!granted) {
      console.warn('Media library permission denied');
      return;
    }
  }
  try {
    const asset = await MediaLibrary.createAssetAsync(tempUri);
    console.log('Video saved to Camera Roll', asset);
  } catch (error) {
    console.error('Error saving video to Camera Roll:', error);
  }
}

  async function stopRecording() {
    if (!cameraRef.current) return;
    cameraRef.current.stopRecording();
    setRecording(false);
  } 

  async function startRecording(options?: { maxDuration?: number }) {
    if (!cameraRef.current) {
      console.error('Camera reference is not available');
      return;
    }
    try {
      setRecording(true);
      const videoData = await cameraRef.current.recordAsync({
        maxDuration: options?.maxDuration ?? 8,
      });
      if (videoData?.uri) await saveToGallery(videoData.uri); // ✅ awaited
      console.log('Video recorded');
    } catch (error) {
      console.error('Error occurred while starting recording:', error);
    } finally {
      setRecording(false); // ✅ always resets even on error
    }
  }


  // async function mouthDetection(options?: {frameUri? : string, frameBase64? : string}) {
  //   if (!cameraRef.current) {
  //     console.error('Camera reference is not available');
  //     return;
  //   }
  //   try {}


  // }

  // ... rest of your JSX unchanged
  return (
    <View style={styles.container}>
      <View style = {styles.progressContainer}>
        <View style={{width: '00%', height: '100%', backgroundColor: 'black'}} />
        <Text style={styles.progressText}>Processing... [0/75]</Text>
      </View>
      <Camera style={styles.camera} ref = {cameraRef} device={device} outputs = {[videoOutput]} mute={true} video = {true} audio = {false} />
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleRecordButton} activeOpacity={0.7}>
          <View style={styles.recordDot} />
          <Text style={[styles.text, { color: '#cd5151' }]}> {recording ? 'Stop Recording' : 'Start Recording'}</Text>
        </TouchableOpacity>
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

