import Foundation

enum ConversationProgress {
  enum Indicator: Equatable { case hidden, sending, queued, preparing, approval, typing }

  static func activeTask(in tasks: [AgentTask]) -> AgentTask? {
    tasks.first { ["running", "awaiting_approval"].contains($0.status) }
      ?? tasks.last { $0.status == "queued" }
  }

  static func indicator(task: AgentTask?, run: ActiveRun?, sending: Bool) -> Indicator {
    guard let task else { return sending ? .sending : .hidden }
    if task.status == "queued" { return .queued }
    if task.status == "awaiting_approval" { return .approval }
    guard task.status == "running" else { return .hidden }
    return run?.taskId == task.id && run?.status == "running" ? .typing : .preparing
  }
}
