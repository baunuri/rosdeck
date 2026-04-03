const { withMainActivity } = require('@expo/config-plugins');

module.exports = function withGamepadActivity(config) {
  return withMainActivity(config, (config) => {
    const mainActivity = config.modResults;

    // Add import
    if (!mainActivity.contents.includes('expo.modules.gamepad')) {
      mainActivity.contents = mainActivity.contents.replace(
        'import android.os.Bundle',
        'import android.os.Bundle\nimport android.view.MotionEvent\nimport expo.modules.gamepad.ExpoGamepadModule'
      );
    }

    // Add dispatchGenericMotionEvent override
    if (!mainActivity.contents.includes('dispatchGenericMotionEvent')) {
      mainActivity.contents = mainActivity.contents.replace(
        /class MainActivity[\s\S]*?\{/,
        (match) => `${match}\n  override fun dispatchGenericMotionEvent(ev: MotionEvent): Boolean {\n    if (ExpoGamepadModule.handleMotionEvent(ev)) return true\n    return super.dispatchGenericMotionEvent(ev)\n  }\n`
      );
    }

    return config;
  });
};
