package Waikiki.Yoto

import System
import System.Globalization
import System.Text.Json.Nodes

class JsonHelpers {
    shared {
        func Str(node JsonNode?, key string) string? {
            if let n = node {
                if let v = n[key] {
                    return v.ToString()
                }
            }
            return nil
        }

        func Num(node JsonNode?, key string) float64 {
            if let s = Str(node, key) {
                return float64.Parse(s, CultureInfo.InvariantCulture)
            }
            return 0.0
        }

        func Child(node JsonNode?, key string) JsonNode? {
            if let n = node {
                return n[key]
            }
            return nil
        }
    }
}
