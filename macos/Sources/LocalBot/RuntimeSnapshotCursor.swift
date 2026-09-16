import Foundation

struct RuntimeSnapshotCursor {
  enum Update { case unchanged, changed, restarted }
  private var instanceId: String?
  private var revision: Int?

  mutating func reset() { instanceId = nil; revision = nil }

  mutating func receive(instanceId nextInstance: String?, revision nextRevision: Int) -> Update {
    let restarted = revision == nil || instanceId != nextInstance
    guard restarted || revision != nextRevision else { return .unchanged }
    instanceId = nextInstance
    revision = nextRevision
    return restarted ? .restarted : .changed
  }
}
