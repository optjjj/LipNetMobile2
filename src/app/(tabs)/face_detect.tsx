import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useCameraDevice, useCameraPermission } from 'react-native-vision-camera'
import { Camera, Face } from 'react-native-vision-camera-face-detector'

export default function face_detect() {
    const device = useCameraDevice('front')
    const { hasPermission, requestPermission } = useCameraPermission()

    useEffect(() => {
        if (!hasPermission) {
            requestPermission()
        }
    }, [hasPermission])

    function handleFacesDetected(faces: Face[]) {
        console.log('faces', faces.length)
    }

    return (
        <View style={{ flex: 1 }}>
            {!hasPermission ? (
                <Text>No camera permission</Text>
            ) : !!device ? (
                <Camera
                    runClassifications
                    onError={(error) => console.error('Camera error:', error)}
                    runContours
                    runLandmarks
                    style={StyleSheet.absoluteFill}
                    onFacesDetected={handleFacesDetected}
                    device={device}
                />
            ) : (
                <Text>No Device</Text>
            )}
        </View>
    )
}