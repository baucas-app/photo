import SwiftUI

struct AlbumCommentModel: Codable, Identifiable {
    let id: String
    let body: String
    let createdAt: Date
    let userId: String
    let user: CommentUser?

    struct CommentUser: Codable {
        let id: String
        let name: String?
        let email: String?

        var displayName: String { name ?? email ?? "Unbekannt" }
    }
}

struct AlbumCommentsSheet: View {
    let albumId: String
    let currentUserId: String

    @State private var comments: [AlbumCommentModel] = []
    @State private var input = ""
    @State private var sending = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if comments.isEmpty {
                    ContentUnavailableView(
                        "Noch keine Kommentare",
                        systemImage: "bubble.left.and.bubble.right"
                    )
                    .frame(maxHeight: .infinity)
                } else {
                    List {
                        ForEach(comments) { comment in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(comment.user?.displayName ?? "")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    Text(comment.createdAt.formatted(.relative(presentation: .named)))
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                }
                                Text(comment.body)
                                    .font(.subheadline)
                            }
                        }
                        .onDelete { indexSet in
                            Task { await deleteComments(at: indexSet) }
                        }
                    }
                    .listStyle(.plain)
                }

                Divider()

                HStack(spacing: Spacing.sm) {
                    TextField("Kommentar…", text: $input, axis: .vertical)
                        .lineLimit(1...4)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, Spacing.xs)
                        .background(Color(.systemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    Button {
                        Task { await send() }
                    } label: {
                        Image(systemName: "paperplane.fill")
                            .font(.title3)
                    }
                    .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || sending)
                }
                .padding(Spacing.sm)
            }
            .navigationTitle("Kommentare")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }
                }
            }
            .task { await load() }
            .alert("Fehler", isPresented: Binding(
                get: { error != nil },
                set: { if !$0 { error = nil } }
            )) {} message: { Text(error ?? "") }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func load() async {
        comments = (try? await APIClient.shared.request("/albums/\(albumId)/comments")) ?? []
    }

    private func send() async {
        sending = true
        defer { sending = false }
        let body = input.trimmingCharacters(in: .whitespaces)
        guard !body.isEmpty else { return }
        do {
            struct Body: Encodable { let body: String }
            try await APIClient.shared.requestVoid("/albums/\(albumId)/comments", method: "POST", body: Body(body: body))
            input = ""
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func deleteComments(at indexSet: IndexSet) async {
        for index in indexSet {
            let id = comments[index].id
            try? await APIClient.shared.requestVoid("/albums/\(albumId)/comments/\(id)", method: "DELETE")
        }
        await load()
    }
}
