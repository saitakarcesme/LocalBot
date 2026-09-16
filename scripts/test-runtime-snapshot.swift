import Foundation

@main struct SnapshotChecks {
  static func main() {
    var cursor = RuntimeSnapshotCursor()
    precondition(cursor.receive(instanceId: "first", revision: 0) == .restarted)
    precondition(cursor.receive(instanceId: "first", revision: 0) == .unchanged)
    precondition(cursor.receive(instanceId: "first", revision: 1) == .changed)
    // A fast restart can reuse a revision even when no network request failed.
    precondition(cursor.receive(instanceId: "second", revision: 1) == .restarted)
    precondition(cursor.receive(instanceId: "second", revision: 1) == .unchanged)
    cursor.reset()
    precondition(cursor.receive(instanceId: "second", revision: 1) == .restarted)
    // Older runtimes without an instance ID still support revision polling.
    cursor.reset()
    precondition(cursor.receive(instanceId: nil, revision: 0) == .restarted)
    precondition(cursor.receive(instanceId: nil, revision: 1) == .changed)
    precondition(cursor.receive(instanceId: "upgraded", revision: 1) == .restarted)
    print("Runtime snapshot restart checks passed")
  }
}
