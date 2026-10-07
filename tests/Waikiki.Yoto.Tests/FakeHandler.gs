package Waikiki.Yoto.Tests

import System
import System.Collections.Generic
import System.Net
import System.Net.Http
import System.Threading
import System.Threading.Tasks

data class Recorded {
    init(method string, url string, authorization string?, contentType string?, contentLength int64?, body string) {
        Method = method
        Url = url
        Authorization = authorization
        ContentType = contentType
        ContentLength = contentLength
        Body = body
    }

    prop Method string {
        get;
        init;
    }

    prop Url string {
        get;
        init;
    }

    prop Authorization string? {
        get;
        init;
    }

    prop ContentType string? {
        get;
        init;
    }

    prop ContentLength int64? {
        get;
        init;
    }

    prop Body string {
        get;
        init;
    }
}

/// Serves queued responses in order and records every request.
class FakeHandler : HttpMessageHandler {
    private let responses Queue[HttpResponseMessage] = Queue[HttpResponseMessage]()

    prop Requests List[Recorded] {
        get;
        init;
    }

    init() {
        Requests = List[Recorded]()
    }

    func Enqueue(status int32, body string) {
        let r = HttpResponseMessage(HttpStatusCode(status))
        r.Content = StringContent(body)
        responses.Enqueue(r)
    }

    func EnqueueRetryAfter(status int32, seconds int32) {
        let r = HttpResponseMessage(HttpStatusCode(status))
        r.Content = StringContent("slow down")
        r.Headers.RetryAfter = System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromSeconds(float64(seconds)))
        responses.Enqueue(r)
    }

    protected override async func SendAsync(request HttpRequestMessage, cancellationToken CancellationToken) HttpResponseMessage {
        var body = ""
        var type string? = nil
        var length int64? = nil
        if let c = request.Content {
            body = await c.ReadAsStringAsync(cancellationToken)
            type = c.Headers.ContentType?.ToString()
            length = c.Headers.ContentLength
        }
        Requests.Add(Recorded(
            request.Method.Method,
            request.RequestUri!!.ToString(),
            request.Headers.Authorization?.ToString(),
            type,
            length,
            body
        ))
        if responses.Count == 0 {
            throw InvalidOperationException("No queued response for ${request.Method} ${request.RequestUri}")
        }
        return responses.Dequeue()
    }
}
