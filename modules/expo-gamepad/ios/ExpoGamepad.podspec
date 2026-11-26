Pod::Spec.new do |s|
  s.name           = 'ExpoGamepad'
  s.version        = '0.1.0'
  s.summary        = 'Game controller axes and connection events (GameController framework)'
  s.homepage       = 'https://github.com/baunuri/rosdeck'
  s.license        = 'GPL-3.0'
  s.author         = 'ROSDeck'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.9'
  s.frameworks     = 'GameController'
  s.source_files   = '**/*.swift'
end
