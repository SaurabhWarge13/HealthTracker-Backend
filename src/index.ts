// Imported first: env validation throws here, before anything binds a port.
import { env } from './config/env';
import { createApp } from './app';
import { getLocalIp } from './utils/getLocalIp';

const app = createApp();

// 0.0.0.0, not 127.0.0.1, or the Android emulator and physical phones on the
// same Wi-Fi cannot reach the server.
app.listen(env.PORT, '0.0.0.0', () => {
  const lanIp = getLocalIp();

  console.log('\nServer running:');
  console.log(`  http://localhost:${env.PORT}`);
  if (lanIp) {
    console.log(`  http://${lanIp}:${env.PORT}   <- use this address in the app's Server URL field`);
  } else {
    console.log('  (no LAN address detected - not connected to a network?)');
  }
  console.log(`\n  Android emulator: http://10.0.2.2:${env.PORT}\n`);
});
