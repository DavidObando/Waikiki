package Waikiki.Mp4.Tests

import System
import Waikiki.Mp4
import Xunit

class ChapterTests {
    @Fact
    func Duration_Is_End_Minus_Start() {
        let c = Chapter("One", TimeSpan.FromSeconds(10.0), TimeSpan.FromSeconds(25.0))
        Assert.Equal(TimeSpan.FromSeconds(15.0), c.Duration)
    }
}
