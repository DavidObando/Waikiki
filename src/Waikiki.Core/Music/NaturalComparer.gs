package Waikiki.Core.Music

import System
import System.Collections.Generic

/// Compares strings so that "2" sorts before "10" (digit runs compare as numbers), ignoring case.
class NaturalComparer : IComparer[string] {
    func Compare(x string?, y string?) int32 {
        let a = x ?? ""
        let b = y ?? ""
        var i = 0
        var j = 0
        while i < a.Length && j < b.Length {
            if Char.IsDigit(a[i]) && Char.IsDigit(b[j]) {
                var si = i
                while si < a.Length && a[si] == '0' {
                    si++
                }
                var sj = j
                while sj < b.Length && b[sj] == '0' {
                    sj++
                }
                var ei = si
                while ei < a.Length && Char.IsDigit(a[ei]) {
                    ei++
                }
                var ej = sj
                while ej < b.Length && Char.IsDigit(b[ej]) {
                    ej++
                }
                let lenA = ei - si
                let lenB = ej - sj
                if lenA != lenB {
                    return if lenA < lenB { -1 } else { 1 }
                }
                let c = string.CompareOrdinal(a.Substring(si, lenA), b.Substring(sj, lenB))
                if c != 0 {
                    return if c < 0 { -1 } else { 1 }
                }
                i = ei
                j = ej
            } else {
                let ca = Char.ToUpperInvariant(a[i])
                let cb = Char.ToUpperInvariant(b[j])
                if ca != cb {
                    return if ca < cb { -1 } else { 1 }
                }
                i++
                j++
            }
        }
        return (a.Length - i) - (b.Length - j)
    }
}
