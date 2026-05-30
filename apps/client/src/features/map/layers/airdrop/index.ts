import { registerMapLayer } from '../registry';
import { useAirdropLayer } from './useAirdropLayer';

registerMapLayer({ id: 'airdrop', mount: useAirdropLayer });
