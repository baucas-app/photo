import Foundation

enum APIError: Error, LocalizedError {
    case notConfigured
    case unauthorized
    case server(status: Int, message: String)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Keine Server-Adresse konfiguriert."
        case .unauthorized: return "Anmeldung erforderlich."
        case .server(_, let message): return message
        case .decoding: return "Antwort des Servers konnte nicht gelesen werden."
        }
    }
}

/// Talks to the Photos backend. Mirrors frontend/src/api/client.ts: a short-
/// lived JWT access token for normal requests, transparent refresh-and-retry
/// on 401, and a long-lived API key for building directly loadable image
/// URLs (used by AsyncImage, which can't attach an Authorization header).
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession = .shared
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds
        return decoder
    }()

    // Every Keychain lookup is scoped to whichever account is currently
    // active, so switching accounts (AccountsStore.activeAccountId) takes
    // effect on the very next request without needing a new APIClient.
    private var currentAccountId: String { AccountsStore.activeAccountId ?? "default" }
    private var accessToken: String? { KeychainStore.get(.accessToken, account: currentAccountId) }
    private var refreshToken: String? { KeychainStore.get(.refreshToken, account: currentAccountId) }

    private func baseURL() throws -> URL {
        guard let url = ServerConfig.baseURL else { throw APIError.notConfigured }
        return url
    }

    // MARK: - JSON requests

    func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil,
        authenticated: Bool = true,
        retry: Bool = true
    ) async throws -> T {
        let data = try await requestData(path, method: method, body: body, authenticated: authenticated, retry: retry)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func requestVoid(_ path: String, method: String = "GET", body: Encodable? = nil) async throws {
        _ = try await requestData(path, method: method, body: body, authenticated: true, retry: true)
    }

    private func requestData(
        _ path: String,
        method: String,
        body: Encodable?,
        authenticated: Bool,
        retry: Bool
    ) async throws -> Data {
        var request = URLRequest(url: try baseURL().appendingPathComponent("api\(path)"))
        request.httpMethod = method

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder.photosAPI.encode(AnyEncodable(body))
        }
        if authenticated, let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.server(status: -1, message: "Keine Antwort vom Server")
        }

        if http.statusCode == 401, authenticated, retry {
            if await refreshAccessToken() {
                return try await requestData(path, method: method, body: body, authenticated: true, retry: false)
            }
            throw APIError.unauthorized
        }

        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode(ErrorResponse.self, from: data))?.error ?? "Serverfehler (\(http.statusCode))"
            throw APIError.server(status: http.statusCode, message: message)
        }

        return data
    }

    private struct ErrorResponse: Decodable { let error: String }

    @discardableResult
    private func refreshAccessToken() async -> Bool {
        guard let refreshToken else { return false }
        struct RefreshBody: Encodable { let refreshToken: String }
        struct RefreshResponse: Decodable { let accessToken: String; let refreshToken: String }

        guard let data = try? await requestData(
            "/auth/refresh", method: "POST", body: RefreshBody(refreshToken: refreshToken),
            authenticated: false, retry: false
        ), let decoded = try? decoder.decode(RefreshResponse.self, from: data) else {
            return false
        }

        KeychainStore.set(decoded.accessToken, for: .accessToken, account: currentAccountId)
        KeychainStore.set(decoded.refreshToken, for: .refreshToken, account: currentAccountId)
        return true
    }

    // MARK: - Multipart upload

    func upload<T: Decodable>(_ path: String, fileURL: URL, fieldName: String = "file", extraFields: [String: String] = [:]) async throws -> T {
        var request = URLRequest(url: try baseURL().appendingPathComponent("api\(path)"))
        request.httpMethod = "POST"
        if let accessToken { request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization") }

        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        for (key, value) in extraFields {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        let fileData = try Data(contentsOf: fileURL)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(fileURL.lastPathComponent)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        let (data, response) = try await session.upload(for: request, from: body)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.server(status: (response as? HTTPURLResponse)?.statusCode ?? -1, message: "Upload fehlgeschlagen")
        }
        return try decoder.decode(T.self, from: data)
    }

    // MARK: - Direct, synchronously-buildable image URLs (uses the long-lived
    // API key, not the JWT, so they work in AsyncImage/CachedThumbnail
    // without an actor hop or an Authorization header).

    nonisolated static func imageURL(path: String) -> URL? {
        guard let base = ServerConfig.baseURL,
              let apiKey = KeychainStore.get(.apiKey, account: AccountsStore.activeAccountId ?? "default")
        else { return nil }
        return base
            .appendingPathComponent("api\(path)")
            .appending(queryItems: [URLQueryItem(name: "apiKey", value: apiKey)])
    }

    nonisolated static func thumbnailURL(for asset: Asset) -> URL? {
        imageURL(path: "/assets/\(asset.id)/thumbnail")
    }

    nonisolated static func fileURL(for asset: Asset) -> URL? {
        imageURL(path: "/assets/\(asset.id)/file")
    }
}

private struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeClosure = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeClosure(encoder) }
}

extension JSONEncoder {
    static let photosAPI: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

extension JSONDecoder.DateDecodingStrategy {
    static let iso8601WithFractionalSeconds = JSONDecoder.DateDecodingStrategy.custom { decoder in
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)

        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: raw) { return date }

        let withoutFraction = ISO8601DateFormatter()
        withoutFraction.formatOptions = [.withInternetDateTime]
        if let date = withoutFraction.date(from: raw) { return date }

        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(raw)")
    }
}
