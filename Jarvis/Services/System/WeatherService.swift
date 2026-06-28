import Foundation
import CoreLocation

struct WeatherData {
    let temperature: Double
    let feelsLike: Double
    let humidity: Int
    let windSpeed: Double
    let condition: String
    let icon: String
    let location: String

    var formattedTemperature: String { "\(Int(temperature))°C" }
    var formattedWind: String { "\(Int(windSpeed)) km/h" }
    var formattedHumidity: String { "\(humidity)%" }

    var jarvisDescription: String {
        "Actuellement \(formattedTemperature) à \(location), \(condition). " +
        "Ressenti \(Int(feelsLike))°C, humidité \(formattedHumidity), vent \(formattedWind)."
    }
}

final class WeatherService: NSObject, ObservableObject {
    static let shared = WeatherService()
    private let locationManager = CLLocationManager()
    private var location: CLLocation?
    private var locationContinuation: CheckedContinuation<CLLocation, Error>?

    private override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func requestWeather(for locationName: String = "") async throws -> WeatherData {
        if locationName.isEmpty || locationName == "ma position" {
            let loc = try await getCurrentLocation()
            return try await fetchWeather(latitude: loc.coordinate.latitude, longitude: loc.coordinate.longitude, locationName: "votre position")
        } else {
            let coords = try await geocode(locationName: locationName)
            return try await fetchWeather(latitude: coords.0, longitude: coords.1, locationName: locationName)
        }
    }

    private func fetchWeather(latitude: Double, longitude: Double, locationName: String) async throws -> WeatherData {
        let urlString = "\(AppConstants.API.weatherBaseURL)/forecast?latitude=\(latitude)&longitude=\(longitude)&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&wind_speed_unit=kmh&timezone=auto"

        guard let url = URL(string: urlString) else { throw NetworkError.invalidURL }
        let data = try await NetworkService.shared.fetch(url: url)

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let current = json["current"] as? [String: Any]
        else { throw NetworkError.decodingFailed }

        let temp = current["temperature_2m"] as? Double ?? 0
        let feelsLike = current["apparent_temperature"] as? Double ?? 0
        let humidity = current["relative_humidity_2m"] as? Int ?? 0
        let wind = current["wind_speed_10m"] as? Double ?? 0
        let code = current["weather_code"] as? Int ?? 0

        let (condition, icon) = weatherDescription(for: code)

        return WeatherData(
            temperature: temp,
            feelsLike: feelsLike,
            humidity: humidity,
            windSpeed: wind,
            condition: condition,
            icon: icon,
            location: locationName
        )
    }

    private func getCurrentLocation() async throws -> CLLocation {
        if let loc = location { return loc }

        return try await withCheckedThrowingContinuation { continuation in
            self.locationContinuation = continuation
            locationManager.requestWhenInUseAuthorization()
            locationManager.requestLocation()
        }
    }

    private func geocode(locationName: String) async throws -> (Double, Double) {
        let encoded = locationName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? locationName
        guard let url = URL(string: "https://geocoding-api.open-meteo.com/v1/search?name=\(encoded)&count=1") else {
            throw NetworkError.invalidURL
        }
        let data = try await NetworkService.shared.fetch(url: url)
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let results = json["results"] as? [[String: Any]],
              let first = results.first,
              let lat = first["latitude"] as? Double,
              let lon = first["longitude"] as? Double
        else { throw NetworkError.decodingFailed }
        return (lat, lon)
    }

    private func weatherDescription(for code: Int) -> (String, String) {
        switch code {
        case 0: return ("Ciel dégagé", "sun.max.fill")
        case 1, 2, 3: return ("Partiellement nuageux", "cloud.sun.fill")
        case 45, 48: return ("Brouillard", "cloud.fog.fill")
        case 51, 53, 55: return ("Bruine légère", "cloud.drizzle.fill")
        case 61, 63: return ("Pluie modérée", "cloud.rain.fill")
        case 65: return ("Forte pluie", "cloud.heavyrain.fill")
        case 71, 73, 75: return ("Neige", "cloud.snow.fill")
        case 80, 81, 82: return ("Averses", "cloud.rain.fill")
        case 95: return ("Orage", "cloud.bolt.rain.fill")
        case 96, 99: return ("Orage avec grêle", "cloud.bolt.fill")
        default: return ("Variable", "cloud.fill")
        }
    }
}

extension WeatherService: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        location = locations.first
        locationContinuation?.resume(returning: locations.first ?? CLLocation())
        locationContinuation = nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        locationContinuation?.resume(throwing: error)
        locationContinuation = nil
    }
}
