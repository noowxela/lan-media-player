const { withEntitlementsPlist, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const EMPTY_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict/>
</plist>
`;

function stripPaidTeamCapabilities(entitlements) {
  if (!entitlements || typeof entitlements !== 'object') return entitlements;
  delete entitlements['aps-environment'];
  delete entitlements['com.apple.security.application-groups'];
  return entitlements;
}

/**
 * Personal (free) Apple IDs cannot sign Push Notifications or App Groups.
 * expo-widgets always adds both. Strip them so device installs still work.
 * A paid Apple Developer account is required for a live Now Playing widget.
 */
function withPersonalTeamSigning(config) {
  if (config.ios?.entitlements) {
    config.ios.entitlements = stripPaidTeamCapabilities({ ...config.ios.entitlements });
  }

  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults = stripPaidTeamCapabilities(mod.modResults);
    return mod;
  });

  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const widgetEntitlements = path.join(
        mod.modRequest.platformProjectRoot,
        'ExpoWidgetsTarget',
        'ExpoWidgetsTarget.entitlements'
      );
      if (fs.existsSync(widgetEntitlements)) {
        fs.writeFileSync(widgetEntitlements, EMPTY_ENTITLEMENTS);
      }
      return mod;
    },
  ]);
}

module.exports = withPersonalTeamSigning;
