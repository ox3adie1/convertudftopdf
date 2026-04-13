#!/usr/bin/env python3
"""IndexNow API submission script for convertudftopdf.com and udfkit.com"""
import json
import urllib.request

INDEXNOW_KEY = "dc90cf242200482c984b878da1cb3083"

URLS_CONVERTUDFTOPDF = [
    "https://convertudftopdf.com/",
    "https://convertudftopdf.com/udf-to-pdf.html",
    "https://convertudftopdf.com/udf-nedir.html",
    "https://convertudftopdf.com/uyap-pdf-donusturucu.html",
    "https://convertudftopdf.com/udf-dosyasi-acma.html",
    "https://convertudftopdf.com/karsilastirma.html",
    "https://convertudftopdf.com/uyap-sozluk.html",
    "https://convertudftopdf.com/uyap-rehber.html",
    "https://convertudftopdf.com/en/",
    "https://convertudftopdf.com/en/udf-to-pdf.html",
    "https://convertudftopdf.com/en/what-is-udf.html",
]

URLS_UDFKIT = [
    "https://udfkit.com/",
    "https://udfkit.com/udf-to-pdf.html",
    "https://udfkit.com/udf-nedir.html",
    "https://udfkit.com/uyap-pdf-donusturucu.html",
    "https://udfkit.com/udf-dosyasi-acma.html",
    "https://udfkit.com/karsilastirma.html",
    "https://udfkit.com/uyap-sozluk.html",
    "https://udfkit.com/uyap-rehber.html",
    "https://udfkit.com/en/",
    "https://udfkit.com/en/udf-to-pdf.html",
    "https://udfkit.com/en/what-is-udf.html",
]


def submit_indexnow(host, urls):
    payload = {
        "host": host,
        "key": INDEXNOW_KEY,
        "keyLocation": f"https://{host}/{INDEXNOW_KEY}.txt",
        "urlList": urls
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST"
    )
    try:
        resp = urllib.request.urlopen(req)
        print(f"[OK] {host}: HTTP {resp.status}")
    except urllib.error.HTTPError as e:
        print(f"[ERR] {host}: HTTP {e.code} - {e.reason}")
    except Exception as e:
        print(f"[ERR] {host}: {e}")


def ping_services(urls):
    """Ping search engine services"""
    ping_targets = [
        "https://www.google.com/ping?sitemap=",
        "https://www.bing.com/ping?sitemap=",
    ]
    sitemaps = [
        "https://convertudftopdf.com/sitemap.xml",
        "https://udfkit.com/sitemap-udfkit.xml",
    ]
    for sitemap in sitemaps:
        for target in ping_targets:
            url = target + sitemap
            try:
                resp = urllib.request.urlopen(url)
                print(f"[PING OK] {url} -> {resp.status}")
            except Exception as e:
                print(f"[PING ERR] {url} -> {e}")


if __name__ == "__main__":
    print("=== IndexNow Submission ===")
    submit_indexnow("convertudftopdf.com", URLS_CONVERTUDFTOPDF)
    submit_indexnow("udfkit.com", URLS_UDFKIT)
    print("\n=== Ping Services ===")
    ping_services([])
    print("\nDone!")
