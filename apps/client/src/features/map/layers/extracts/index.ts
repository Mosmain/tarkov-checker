import { registerMapLayer } from '../registry';
import { useExtractsLayer } from './useExtractsLayer';

registerMapLayer({ id: 'extracts', mount: useExtractsLayer });
