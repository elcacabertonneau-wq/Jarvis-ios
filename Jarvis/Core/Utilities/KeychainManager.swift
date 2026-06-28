import Foundation
import Security

final class KeychainManager {
    static let shared = KeychainManager()
    private let service = AppConstants.Keychain.serviceIdentifier
    private init() {}

    func save(_ value: String, forKey key: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    func retrieve(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8)
        else { return nil }
        return string
    }

    func delete(forKey key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    func deleteAll() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ]
        SecItemDelete(query as CFDictionary)
    }

    var openAIKey: String? {
        get { retrieve(forKey: AppConstants.Keychain.openAIKeyID) }
        set {
            if let value = newValue, !value.isEmpty {
                _ = save(value, forKey: AppConstants.Keychain.openAIKeyID)
            } else {
                _ = delete(forKey: AppConstants.Keychain.openAIKeyID)
            }
        }
    }

    var claudeKey: String? {
        get { retrieve(forKey: AppConstants.Keychain.claudeKeyID) }
        set {
            if let value = newValue, !value.isEmpty {
                _ = save(value, forKey: AppConstants.Keychain.claudeKeyID)
            } else {
                _ = delete(forKey: AppConstants.Keychain.claudeKeyID)
            }
        }
    }

    var geminiKey: String? {
        get { retrieve(forKey: AppConstants.Keychain.geminiKeyID) }
        set {
            if let value = newValue, !value.isEmpty {
                _ = save(value, forKey: AppConstants.Keychain.geminiKeyID)
            } else {
                _ = delete(forKey: AppConstants.Keychain.geminiKeyID)
            }
        }
    }
}
