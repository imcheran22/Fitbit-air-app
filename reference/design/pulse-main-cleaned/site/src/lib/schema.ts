import type { Faq } from "../data/metrics"
import { LICENSE_URL, REPO, SITE_NAME } from "../config"

const strip = (html: string) => html.replace(/<[^>]+>/g, "")
const abs = (path: string, site: URL) => new URL(path, site).href
const org = (site: URL) => ({ "@id": abs("/#org", site) })

export function siteGraph(site: URL) {
  return [
    { "@type": "Organization", "@id": abs("/#org", site), name: SITE_NAME, url: abs("/", site), logo: { "@type": "ImageObject", url: abs("/logo.png", site), width: 512, height: 512 }, sameAs: [REPO] },
    { "@type": "WebSite", "@id": abs("/#website", site), name: SITE_NAME, url: abs("/", site), inLanguage: "en", publisher: org(site) },
  ]
}

export function breadcrumbs(site: URL, items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path, site) })),
  }
}

export function faqPage(items: Faq[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: strip(f.a) } })),
  }
}

export function softwareApp(site: URL, description: string) {
  return {
    "@type": "SoftwareApplication",
    "@id": abs("/#app", site),
    name: SITE_NAME,
    description,
    url: abs("/", site),
    applicationCategory: "HealthApplication",
    operatingSystem: "Linux, macOS, Windows (Docker)",
    softwareRequirements: "Docker, a Google account with wearable data in Google Health (built and tested on Fitbit Air)",
    license: LICENSE_URL,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    sameAs: [REPO],
    screenshot: abs("/og.png", site),
    author: org(site),
    publisher: org(site),
  }
}

export function article(site: URL, o: { type: "TechArticle" | "Article"; path: string; headline: string; description: string; modified: string; published: string }) {
  return {
    "@type": o.type,
    headline: o.headline,
    description: o.description,
    url: abs(o.path, site),
    mainEntityOfPage: abs(o.path, site),
    datePublished: o.published,
    dateModified: o.modified,
    inLanguage: "en",
    author: { "@type": "Organization", name: "Pulse contributors", url: REPO },
    publisher: org(site),
    image: abs("/og.png", site),
  }
}

export function collectionPage(site: URL, path: string, name: string, description: string, items: { name: string; path: string }[]) {
  return {
    "@type": "CollectionPage",
    "@id": abs(`${path}#collection`, site),
    url: abs(path, site),
    name,
    description,
    isPartOf: { "@id": abs("/#website", site) },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, url: abs(item.path, site) })),
    },
  }
}
