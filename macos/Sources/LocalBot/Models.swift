import Foundation
import SwiftUI

struct Permissions: Codable, Equatable {
  var filesystem: String
  var terminal: Bool
  var git: Bool
  var web: Bool
}
struct Agent: Codable, Identifiable, Equatable {
  var id: String
  var name: String
  var avatar: String
  var color: String
  var role: String
  var systemPrompt: String
  var providerId: String
  var model: String
  var workspace: String
  var permissions: Permissions
  var autonomy: String
  var memory: String
  var integrations: [String]? = nil
  var maxSteps: Int? = nil
  var tint: Color {
    switch color {
    case "purple": return .purple
    case "orange": return .orange
    case "green": return .green
    case "pink": return .pink
    default: return .blue
    }
  }
}
struct Provider: Codable, Identifiable, Equatable {
  var id: String
  var name: String
  var kind: String
  var endpoint: String
  var model: String
  var contextLength: Int
  var timeout: Int
  var concurrency: Int
  var temperature: Double
  var maxTokens: Int
  var requiresAuth: Bool
  var imageInput: Bool? = nil
}
struct Conversation: Codable, Identifiable {
  var id: String
  var title: String
  var members: [String]
  var createdAt: String
  var updatedAt: String
  var preview: String?
  var projectId: String?
  var archived: Bool? = nil
  var automatic: Int?
}
struct Project: Codable, Identifiable {
  var id: String
  var name: String
  var workspace: String
  var memory: String
  var createdAt: String
}
struct Reaction: Codable, Hashable {
  var actor: String
  var emoji: String
}
struct Artifact: Codable, Identifiable {
  var id: String
  var name: String
  var path: String
  var mime: String
  var size: Int
  var messageId: String?
  var runId: String?
}
struct ChatMessage: Codable, Identifiable {
  var id: String
  var conversationId: String
  var taskId: String?
  var runId: String?
  var agentId: String?
  var role: String
  var content: String
  var createdAt: String
  var reactions: [Reaction]
  var attachments: [Artifact]
}
struct AgentTask: Codable, Identifiable {
  var id: String
  var conversationId: String
  var messageId: String
  var prompt: String
  var status: String
  var error: String?
  var createdAt: String
  var updatedAt: String
  var active: Bool { ["queued", "running", "awaiting_approval"].contains(status) }
}
struct Approval: Codable, Identifiable {
  var id: String
  var taskId: String
  var runId: String
  var toolCallId: String
  var summary: String
  var status: String
  var createdAt: String
}
struct Activity: Codable, Identifiable {
  var id: String
  var runId: String
  var agentId: String
  var taskId: String
  var name: String
  var arguments: String
  var status: String
  var output: String?
  var createdAt: String
}
struct Snapshot: Codable {
  var goals: [AgentGoal]?
  var integrations: [MCPConnection]?
  var projects: [Project]?
  var activeRuns: [ActiveRun]?
  var agents: [Agent]
  var providers: [Provider]
  var conversations: [Conversation]
  var tasks: [AgentTask]
  var approvals: [Approval]
  var revision: Int
}
struct AgentGoal: Codable, Identifiable {
  var id: String
  var conversationId: String
  var objective: String
  var status: String
  var evidence: String
  var createdAt: String
  var updatedAt: String
}
struct MCPProcess: Codable {
  var command: String
  var args: [String]
  var cwd: String
}
struct MCPConnection: Codable, Identifiable {
  var id: String
  var name: String
  var endpoint: String
  var requiresAuth: Bool
  var transport: String? = nil
  var process: MCPProcess? = nil
}
struct ActiveRun: Codable, Identifiable {
  var id: String
  var taskId: String
  var agentId: String
  var status: String
}
struct Health: Codable {
  var ok: Bool
  var models: [String]
}
struct Connection: Codable {
  var url: String
  var token: String
}
func dateFrom(_ s: String) -> Date {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f.date(from: s) ?? Date()
}
