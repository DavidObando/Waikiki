package Waikiki.Core

import System
import System.Collections.Generic
import Waikiki.Yoto

class IconCatalog {
    shared {
        /// Picks a sensible default chapter icon: a "book" icon if Yoto has one, otherwise a story-like one,
        /// otherwise the first icon. Returns nil for an empty library.
        func PickDefault(icons List[DisplayIcon]) string? {
            for wanted in []string{"book", "story", "audiobook", "reading"} {
                for icon in icons {
                    for tag in icon.Tags {
                        if string.Equals(tag, wanted, StringComparison.OrdinalIgnoreCase) {
                            return icon.MediaId
                        }
                    }
                }
                for icon in icons {
                    if icon.Title.Contains(wanted, StringComparison.OrdinalIgnoreCase) {
                        return icon.MediaId
                    }
                }
            }
            if icons.Count > 0 {
                return icons[0].MediaId
            }
            return nil
        }
    }
}
