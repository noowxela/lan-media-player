import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Network from 'expo-network';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes } from '@/lib/format';
import {
  downloadRemoteTrack,
  fetchRemoteTracks,
  hostBaseUrl,
  normalizeHostInput,
  parseJoinPayload,
} from '@/lib/lan-client';
import { LAN_PORT, startLanServer, stopLanServer } from '@/lib/lan-server';
import {
  disconnectClient,
  getConnectedClients,
  getPendingAccessClients,
  resolveAccessRequest,
  subscribeLanAccess,
  type AccessClient,
} from '@/lib/lan-access';
import { ensurePhotoPermission } from '@/lib/photos';
import type { RemoteTrack } from '@/lib/types';

type Mode = 'host' | 'join';

export default function TransferScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('host');
  const [hosting, setHosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState('');
  const [ip, setIp] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [joinHost, setJoinHost] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [status, setStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [connected, setConnected] = useState<AccessClient[]>([]);

  useEffect(() => {
    if (!hosting) {
      setConnected([]);
      return;
    }
    let lastPromptedId = '';
    const sync = () => {
      setConnected(getConnectedClients());
      const next = getPendingAccessClients()[0];
      if (!next || next.id === lastPromptedId) return;
      lastPromptedId = next.id;
      Alert.alert(
        'Permission',
        `${next.ip} requests connection?`,
        [
          {
            text: 'Decline',
            style: 'cancel',
            onPress: () => {
              resolveAccessRequest(next.id, false);
            },
          },
          {
            text: 'Accept',
            onPress: () => {
              resolveAccessRequest(next.id, true);
            },
          },
        ],
        { cancelable: false },
      );
    };
    sync();
    return subscribeLanAccess(sync);
  }, [hosting]);

  const startHost = async () => {
    setBusy(true);
    setStatus('');
    try {
      const photosOk = await ensurePhotoPermission();
      const nextPin = await startLanServer();
      const address = await Network.getIpAddressAsync();
      const url = `${hostBaseUrl(address, LAN_PORT)}?pin=${nextPin}`;
      setPin(nextPin);
      setIp(address);
      setShareUrl(url);
      setHosting(true);
      await activateKeepAwakeAsync('lan-host');
      if (!photosOk) {
        setStatus('Sharing started. Allow Photos access to browse photos and videos from the browser.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not start sharing');
    } finally {
      setBusy(false);
    }
  };

  const stopHost = async () => {
    setBusy(true);
    try {
      await stopLanServer();
      await deactivateKeepAwake('lan-host');
      setHosting(false);
      setShareUrl('');
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    if (!shareUrl) return;
    await Clipboard.setStringAsync(shareUrl);
    setStatus('Copied share URL');
  };

  const connect = async (hostValue = joinHost, pinValue = joinPin) => {
    setBusy(true);
    setStatus('');
    try {
      const { host, port } = normalizeHostInput(hostValue);
      const baseUrl = hostBaseUrl(host, port);
      const tracks = await fetchRemoteTracks(baseUrl, pinValue.trim());
      setRemoteTracks(tracks);
      setJoinHost(`${host}:${port}`);
      setJoinPin(pinValue.trim());
      setStatus(tracks.length ? `Found ${tracks.length} track(s)` : 'Connected — library is empty');
    } catch (error) {
      setRemoteTracks([]);
      setStatus(error instanceof Error ? error.message : 'Could not connect');
    } finally {
      setBusy(false);
    }
  };

  const download = async (track: RemoteTrack) => {
    setBusy(true);
    try {
      const { host, port } = normalizeHostInput(joinHost);
      await downloadRemoteTrack(hostBaseUrl(host, port), joinPin.trim(), track);
      setStatus(`Saved ${track.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadAll = async () => {
    for (const track of remoteTracks) {
      await download(track);
    }
  };

  const onScan = (data: string) => {
    const parsed = parseJoinPayload(data);
    if (!parsed) {
      Alert.alert('Not a transfer QR', data);
      return;
    }
    const hostValue = `${parsed.host}:${parsed.port}`;
    setJoinHost(hostValue);
    if (parsed.pin) setJoinPin(parsed.pin);
    setScanning(false);
    void connect(hostValue, parsed.pin ?? joinPin);
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera needed', 'Allow camera to scan a share QR code, or type the IP instead.');
        return;
      }
    }
    setScanning(true);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          paddingHorizontal: Spacing.three,
          maxWidth: MaxContentWidth,
          width: '100%',
          alignSelf: 'center',
          gap: Spacing.three,
        }}>
        <ThemedText type="subtitle">Transfer</ThemedText>
        <View style={styles.modeRow}>
          <AppButton
            label="Host"
            variant={mode === 'host' ? 'primary' : 'secondary'}
            onPress={() => setMode('host')}
          />
          <AppButton
            label="Join"
            variant={mode === 'join' ? 'primary' : 'secondary'}
            onPress={() => setMode('join')}
          />
        </View>

        {mode === 'host' ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Share this phone</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Starts a local HTTP server. On a computer, open the URL in a browser to upload or
              download MP3s. On another phone, use Join with this URL or QR.
            </ThemedText>
            {hosting ? (
              <>
                <ThemedText type="small">
                  URL: {shareUrl || `http://${ip}:${LAN_PORT}`}
                </ThemedText>
                <ThemedText type="small">PIN: {pin}</ThemedText>
                {shareUrl ? (
                  <View style={styles.qrWrap}>
                    <QRCode value={shareUrl} size={180} />
                  </View>
                ) : null}
                <AppButton label="Copy URL" variant="secondary" onPress={() => void copyUrl()} />
                <ThemedText type="smallBold">Connected devices</ThemedText>
                {connected.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    No computers connected yet
                  </ThemedText>
                ) : (
                  connected.map((client) => (
                    <View key={client.id} style={styles.remoteRow}>
                      <View style={styles.flex}>
                        <ThemedText type="small">{client.ip}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          Browser
                        </ThemedText>
                      </View>
                      <AppButton
                        label="Disconnect"
                        variant="danger"
                        onPress={() => disconnectClient(client.id)}
                      />
                    </View>
                  ))
                )}
                <AppButton label="Stop sharing" variant="danger" onPress={() => void stopHost()} />
              </>
            ) : (
              <AppButton label={busy ? 'Starting…' : 'Start sharing'} onPress={() => void startHost()} />
            )}
          </ThemedView>
        ) : (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Join another device</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Type the host IP (and port if needed) plus PIN, or scan the QR from the other phone.
            </ThemedText>
            <TextInput
              value={joinHost}
              onChangeText={setJoinHost}
              placeholder="192.168.1.20:8765"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <TextInput
              value={joinPin}
              onChangeText={setJoinPin}
              placeholder="PIN"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <View style={styles.modeRow}>
              <AppButton label="Connect" onPress={() => void connect()} />
              <AppButton label="Scan QR" variant="secondary" onPress={() => void openScanner()} />
            </View>
            {scanning ? (
              <View style={styles.scanner}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => onScan(data)}
                />
                <Pressable style={styles.scanClose} onPress={() => setScanning(false)}>
                  <ThemedText type="smallBold">Close camera</ThemedText>
                </Pressable>
              </View>
            ) : null}
            {remoteTracks.map((track) => (
              <View key={track.filename} style={styles.remoteRow}>
                <View style={styles.flex}>
                  <ThemedText type="small">{track.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatBytes(track.size)}
                  </ThemedText>
                </View>
                <AppButton label="Save" variant="secondary" onPress={() => void download(track)} />
              </View>
            ))}
            {remoteTracks.length > 1 ? (
              <AppButton label="Save all" onPress={() => void downloadAll()} />
            ) : null}
          </ThemedView>
        )}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Same Wi-Fi only</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Both devices must be on the same network (guest Wi-Fi with client isolation will fail).
            Keep this app in the foreground while hosting — iOS pauses the server in the background.
            Large files can take a while.
          </ThemedText>
          {status ? (
            <ThemedText type="small" style={styles.status}>
              {status}
            </ThemedText>
          ) : null}
          {busy ? <ActivityIndicator color="#3c87f7" /> : null}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  qrWrap: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  scanner: {
    height: 240,
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  scanClose: {
    position: 'absolute',
    bottom: Spacing.two,
    alignSelf: 'center',
    left: Spacing.two,
    right: Spacing.two,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  remoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  status: {
    marginTop: Spacing.one,
  },
});
