import ExpoModulesCore
import UIKit

// Local Expo module (autolinked from ./modules). Two small things Expo has no JS API for:
//  1. beginBackgroundTask: ~30 s of extra run time after the app leaves the foreground, so the LAN share can
//     finish in-flight transfers and tell clients it is going to sleep before iOS suspends the JS runtime.
//  2. Bonjour advert of the LAN share (_kcphone._tcp) so computers can find the phone without an IP scan.
public class KcBackgroundModule: Module {
  private var tasks: [Int: UIBackgroundTaskIdentifier] = [:]
  private var nextId = 1
  private var service: NetService?

  public func definition() -> ModuleDefinition {
    Name("KcBackground")

    Events("onExpire")

    AsyncFunction("begin") { (name: String) -> Int in
      let id = self.nextId
      self.nextId += 1
      let taskId = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
        guard let self = self else { return }
        self.sendEvent("onExpire", ["id": id])
        if let t = self.tasks.removeValue(forKey: id) {
          UIApplication.shared.endBackgroundTask(t)
        }
      }
      if taskId == .invalid {
        return 0
      }
      self.tasks[id] = taskId
      return id
    }.runOnQueue(.main)

    AsyncFunction("end") { (id: Int) in
      if let t = self.tasks.removeValue(forKey: id) {
        UIApplication.shared.endBackgroundTask(t)
      }
    }.runOnQueue(.main)

    AsyncFunction("remaining") { () -> Double in
      let left = UIApplication.shared.backgroundTimeRemaining
      return left.isFinite ? left : -1
    }.runOnQueue(.main)

    AsyncFunction("publish") { (name: String, type: String, port: Int, txt: [String: String]) in
      self.service?.stop()
      let s = NetService(domain: "local.", type: type, name: name, port: Int32(port))
      var record: [String: Data] = [:]
      for (k, v) in txt { record[k] = v.data(using: .utf8) }
      s.setTXTRecord(NetService.data(fromTXTRecord: record))
      s.publish()
      self.service = s
    }.runOnQueue(.main)

    AsyncFunction("unpublish") {
      self.service?.stop()
      self.service = nil
    }.runOnQueue(.main)

    OnDestroy {
      self.service?.stop()
    }
  }
}
