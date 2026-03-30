const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin to work around Xcode 16.4 strict Swift 6 concurrency
 * errors in expo-modules-core. The podspec declares swift_version = '6.0'
 * which enables strict concurrency as errors. We patch both the podspec
 * (to use Swift 5) and the Podfile post_install (belt and suspenders).
 */
function withSwiftConcurrencyFix(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      // 1. Patch the ExpoModulesCore podspec to use Swift 5 instead of 6
      const podspecPath = path.resolve(
        config.modRequest.projectRoot,
        "node_modules/expo-modules-core/ExpoModulesCore.podspec"
      );
      if (fs.existsSync(podspecPath)) {
        let podspec = fs.readFileSync(podspecPath, "utf8");
        podspec = podspec.replace(
          /s\.swift_version\s*=\s*['"]6\.0['"]/,
          "s.swift_version  = '5.0'"
        );
        fs.writeFileSync(podspecPath, podspec);
      }

      // 2. Also inject post_install build settings as a safety net
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      const snippet = `
    # Workaround: Xcode 16.4 strict Swift 6 concurrency breaks expo-modules-core
    installer.pods_project.targets.each do |target|
      if target.name == 'ExpoModulesCore'
        target.build_configurations.each do |bc|
          bc.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
          bc.build_settings['SWIFT_VERSION'] = '5.0'
        end
      end
    end`;

      if (!podfile.includes("SWIFT_STRICT_CONCURRENCY")) {
        podfile = podfile.replace(
          /^(\s*react_native_post_install\([\s\S]*?\)\s*\n)/m,
          `$1${snippet}\n`
        );
        fs.writeFileSync(podfilePath, podfile);
      }

      return config;
    },
  ]);
}

module.exports = withSwiftConcurrencyFix;
