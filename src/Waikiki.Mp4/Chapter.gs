package Waikiki.Mp4

import System

/// A chapter of an audiobook, expressed as a time range.
data class Chapter {
    init(title string, start TimeSpan, end TimeSpan) {
        Title = title
        Start = start
        End = end
    }

    prop Title string {
        get;
        init;
    }

    prop Start TimeSpan {
        get;
        init;
    }

    prop End TimeSpan {
        get;
        init;
    }

    prop Duration TimeSpan -> End - Start
}
