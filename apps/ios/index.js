/**
 * SecureAgent iOS App Entry Point
 */

import { AppRegistry } from 'react-native';
import App from '@secureagent/mobile';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
