import AppKit
import ApplicationServices
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}
func attribute(_ node: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(node, name as CFString, &value) == .success else { return nil }
    return value
}
func element(_ node: AXUIElement, _ name: String) -> AXUIElement? {
    guard let value = attribute(node, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}
func text(_ node: AXUIElement, _ name: String) -> String {
    attribute(node, name) as? String ?? ""
}
func children(_ node: AXUIElement) -> [AXUIElement] {
    attribute(node, "AXChildren") as? [AXUIElement] ?? []
}
func descendants(_ node: AXUIElement, depth: Int = 0) -> [AXUIElement] {
    guard depth < 13, role(node) != "AXMenuBar" else { return [node] }
    return [node] + children(node).flatMap { descendants($0, depth: depth + 1) }
}
func title(_ node: AXUIElement) -> String { text(node, "AXTitle") }
func role(_ node: AXUIElement) -> String { text(node, "AXRole") }
func detail(_ node: AXUIElement) -> [String: String] {
    ["role": role(node), "title": title(node), "description": text(node, "AXDescription")]
}
func center(_ node: AXUIElement) -> CGPoint? {
    guard let rawPosition = attribute(node, "AXPosition"), let rawSize = attribute(node, "AXSize"),
          CFGetTypeID(rawPosition) == AXValueGetTypeID(), CFGetTypeID(rawSize) == AXValueGetTypeID()
    else { return nil }
    var point = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(rawPosition as! AXValue, .cgPoint, &point),
          AXValueGetValue(rawSize as! AXValue, .cgSize, &size),
          size.width > 0 && size.height > 0 else { return nil }
    return CGPoint(x: point.x + size.width / 2, y: point.y + size.height / 2)
}
func frontmostPid() -> pid_t? { NSWorkspace.shared.frontmostApplication?.processIdentifier }
func json(_ record: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
          let output = String(data: data, encoding: .utf8) else { fail("Could not encode evidence") }
    print(output)
}
func pointOwner(_ point: CGPoint) -> pid_t? {
    var hit: AXUIElement?
    guard AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(point.x), Float(point.y), &hit) == .success,
          let hit else { return nil }
    var owner: pid_t = 0
    guard AXUIElementGetPid(hit, &owner) == .success else { return nil }
    return owner
}
func rightClick(_ point: CGPoint, pid: pid_t) {
    guard frontmostPid() == pid, pointOwner(point) == pid, CGPreflightPostEventAccess() else {
        fail("Owned Chrome is not the foreground process at the tab coordinates")
    }
    guard let down = CGEvent(mouseEventSource: nil, mouseType: .rightMouseDown, mouseCursorPosition: point, mouseButton: .right),
          let up = CGEvent(mouseEventSource: nil, mouseType: .rightMouseUp, mouseCursorPosition: point, mouseButton: .right) else {
        fail("Unable to build native mouse events")
    }
    guard let moved = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) else {
        fail("Unable to position the cursor")
    }
    moved.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.06)
    guard frontmostPid() == pid, pointOwner(point) == pid else { fail("Tab ownership changed before right click") }
    down.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.05)
    up.post(tap: .cghidEventTap)
}

let arguments = CommandLine.arguments
guard arguments.count >= 3, let pid = pid_t(arguments[1]), pid > 0, AXIsProcessTrusted() else {
    fail("An owned Chrome PID and macOS Accessibility permission are required")
}
let app = AXUIElementCreateApplication(pid)
AXUIElementSetMessagingTimeout(app, 1)
let command = arguments[2]
if command == "focus" {
    let focused = element(app, "AXFocusedWindow")
    json(["pid": pid, "frontmostPid": frontmostPid() as Any, "title": focused.map(title) as Any])
    exit(0)
}
guard frontmostPid() == pid, let focused = element(app, "AXFocusedWindow") else { fail("Owned Chrome is not focused") }
guard command == "tab-menu", arguments.count == 5 else { fail("Expected focus or tab-menu TAB_TITLE ACTION_TITLE") }
let tabTitle = arguments[3]
let actionTitle = arguments[4]
let tabs = descendants(focused).filter { node in
    ["AXTab", "AXRadioButton"].contains(role(node)) &&
        (title(node).contains(tabTitle) || text(node, "AXDescription").contains(tabTitle))
}
guard tabs.count == 1, let point = center(tabs[0]) else {
    fail("Expected one native tab with title " + tabTitle + ". Observed " + String(describing: descendants(focused).filter { ["AXTab", "AXRadioButton"].contains(role($0)) }.map(detail)))
}
let tabDetail = detail(tabs[0])
rightClick(point, pid: pid)
var menuItemCount = 0
let timeout = Date().addingTimeInterval(4)
repeat {
    guard frontmostPid() == pid else { fail("Foreground ownership changed while looking for the native menu") }
    let windows = attribute(app, "AXWindows") as? [AXUIElement] ?? []
    let roots = [element(app, "AXShownMenuUIElement"), element(app, "AXFocusedUIElement"),
                 element(tabs[0], "AXShownMenuUIElement"), element(focused, "AXShownMenuUIElement")].compactMap { $0 }
                 + windows + children(app).filter { role($0) == "AXMenu" }
    for root in roots {
        let menuNodes = descendants(root).filter { role($0) == "AXMenuItem" }
        menuItemCount = max(menuItemCount, menuNodes.count)
        if let item = menuNodes.first(where: { title($0) == actionTitle }) {
            guard frontmostPid() == pid else { fail("Foreground ownership changed before invoking the menu") }
            var owner: pid_t = 0
            guard AXUIElementGetPid(item, &owner) == .success, owner == pid else { fail("Context menu item is not owned by the isolated Chrome process") }
            let actionDetail = detail(item)
            let result = AXUIElementPerformAction(item, kAXPressAction as CFString)
            guard result == .success || result == .cannotComplete else { fail("AXPress failed with " + String(result.rawValue)) }
            json(["pid": pid, "tab": tabDetail, "action": actionDetail,
                  "point": ["x": point.x, "y": point.y], "axPress": result.rawValue])
            exit(0)
        }
    }
    Thread.sleep(forTimeInterval: 0.08)
} while Date() < timeout
fail("Native action was unavailable. Scoped AX menu item count: " + String(menuItemCount) + "; tab point: " + String(describing: point))
