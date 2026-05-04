// Re-export ValidityBadge as NonExpiryBadge for backward compatibility
import ValidityBadge from './ValidityBadge';
export default ValidityBadge;
export { getValidityLabel, isNonExpiry, getNetworkValidity } from './ValidityBadge';
