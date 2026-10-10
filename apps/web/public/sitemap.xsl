<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  exclude-result-prefixes="s image">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>NotesUG Sitemap</title>
        <style>
          :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
          body { max-width: 1180px; margin: 0 auto; padding: 32px 20px 64px; color: #172554; background: #f8fafc; }
          h1 { margin-bottom: 8px; color: #0f766e; }
          p { color: #475569; margin-top: 0; }
          .summary { display: inline-block; margin: 12px 0 24px; padding: 8px 12px; border-radius: 999px; background: #ccfbf1; color: #115e59; font-weight: 700; }
          .table-wrap { overflow-x: auto; border: 1px solid #cbd5e1; border-radius: 12px; background: white; box-shadow: 0 8px 24px rgba(15, 23, 42, .06); }
          table { width: 100%; border-collapse: collapse; font-size: 14px; }
          th { background: #0f766e; color: white; text-align: left; padding: 12px; }
          td { padding: 11px 12px; border-top: 1px solid #e2e8f0; vertical-align: top; }
          tr:hover td { background: #f0fdfa; }
          a { color: #0f766e; text-decoration: none; overflow-wrap: anywhere; }
          a:hover { text-decoration: underline; }
          .muted { color: #64748b; white-space: nowrap; }
          @media (prefers-color-scheme: dark) {
            body { color: #e2e8f0; background: #0f172a; }
            h1, a { color: #5eead4; }
            p, .muted { color: #94a3b8; }
            .summary { background: #134e4a; color: #ccfbf1; }
            .table-wrap { background: #111827; border-color: #334155; }
            td { border-color: #334155; }
            tr:hover td { background: #132f2e; }
          }
        </style>
      </head>
      <body>
        <h1>NotesUG Sitemap</h1>
        <p>This sitemap helps search engines discover NotesUG learning resources and landing pages.</p>
        <xsl:choose>
          <xsl:when test="s:sitemapindex">
            <div class="summary"><xsl:value-of select="count(s:sitemapindex/s:sitemap)"/> sitemap files</div>
            <div class="table-wrap"><table>
              <thead><tr><th>Sitemap</th><th>Last updated</th></tr></thead>
              <tbody><xsl:for-each select="s:sitemapindex/s:sitemap">
                <tr>
                  <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
                  <td class="muted"><xsl:value-of select="s:lastmod"/></td>
                </tr>
              </xsl:for-each></tbody>
            </table></div>
          </xsl:when>
          <xsl:otherwise>
            <div class="summary"><xsl:value-of select="count(s:urlset/s:url)"/> indexed URLs</div>
            <div class="table-wrap"><table>
              <thead><tr><th>URL</th><th>Last updated</th><th>Frequency</th><th>Priority</th><th>Image</th></tr></thead>
              <tbody><xsl:for-each select="s:urlset/s:url">
                <tr>
                  <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
                  <td class="muted"><xsl:value-of select="s:lastmod"/></td>
                  <td><xsl:value-of select="s:changefreq"/></td>
                  <td><xsl:value-of select="s:priority"/></td>
                  <td><xsl:if test="image:image/image:loc"><a href="{image:image/image:loc}">View image</a></xsl:if></td>
                </tr>
              </xsl:for-each></tbody>
            </table></div>
          </xsl:otherwise>
        </xsl:choose>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
