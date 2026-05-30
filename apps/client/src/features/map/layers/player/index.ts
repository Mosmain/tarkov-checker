import { registerMapLayer } from '../registry';
import { usePlayerLayer } from './usePlayerLayer';

registerMapLayer({ id: 'player', mount: usePlayerLayer });
