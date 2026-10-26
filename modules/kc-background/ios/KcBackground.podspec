Pod::Spec.new do |s|
  s.name           = 'KcBackground'
  s.version        = '1.0.0'
  s.summary        = 'Background grace time + Bonjour advert for the LAN share'
  s.description    = 'UIApplication.beginBackgroundTask (finish in-flight transfers before iOS suspends the app) and NetService publish of _kcphone._tcp.'
  s.author         = ''
  s.homepage       = 'https://github.com/noowxela/lan-media-player'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,mm,swift}"
end
