const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://malawi.me' })
global.window = dom.window
global.document = window.document
global.navigator = window.navigator
const cookieParser = require('cookie-parser')
const router = require('./server/router.js')
const cors = require('cors')
const hasToken = require('./server/has-token.js')

const fs = require('fs')
const path = require('path')
const LRU = require('lru-cache')
const express = require('express')
const favicon = require('serve-favicon')
const compression = require('compression')
const resolve = file => path.resolve(__dirname, file)
const { createBundleRenderer } = require('vue-server-renderer')

const isProd = process.env.NODE_ENV === 'production'
const useMicroCache = process.env.MICRO_CACHE !== 'false'
const serverInfo =
  `express/${require('express/package.json').version} ` +
  `vue-server-renderer/${require('vue-server-renderer/package.json').version}`

const app = express()
app.use(cookieParser())

const template = fs.readFileSync(resolve('./src/index.template.html'), 'utf-8')

function createRenderer (bundle, options) {
  // https://github.com/vuejs/vue/blob/dev/packages/vue-server-renderer/README.md#why-use-bundlerenderer
  return createBundleRenderer(bundle, Object.assign(options, {
    template,
    // for component caching
    cache: LRU({
      max: 1000,
      maxAge: 1000 * 60 * 15
    }),
    // this is only needed when vue-server-renderer is npm-linked
    basedir: resolve('./dist'),
    // recommended for performance
    runInNewContext: true
  }))
}

let renderer
let readyPromise
if (isProd) {
  // In production: create server renderer using built server bundle.
  // The server bundle is generated by vue-ssr-webpack-plugin.
  const bundle = require('./dist/vue-ssr-server-bundle.json')
  // The client manifests are optional, but it allows the renderer
  // to automatically infer preload/prefetch links and directly add <script>
  // tags for any async chunks used during render, avoiding waterfall requests.
  const clientManifest = require('./dist/vue-ssr-client-manifest.json')
  renderer = createRenderer(bundle, {
    clientManifest
  })
} else {
  // In development: setup the dev server with watch and hot-reload,
  // and create a new renderer on bundle / index template update.
  readyPromise = require('./build/setup-dev-server')(app, (bundle, options) => {
    renderer = createRenderer(bundle, options)
  })
}

const serve = (path, cache) => express.static(resolve(path), {
  maxAge: cache && isProd ? 1000 * 60 * 60 * 24 * 30 : 0
})

app.use(cors())
app.use(compression({ threshold: 0 }))
app.use(favicon('./public/logo-48.png'))
app.use('/dist', serve('./dist', true))
app.use('/public', serve('./public', true))
app.use('/manifest.json', serve('./manifest.json', true))
app.use('/service-worker.js', serve('./dist/service-worker.js'))

// 1-second microcache.
// https://www.nginx.com/blog/benefits-of-microcaching-nginx/
const microCache = LRU({
  max: 100,
  maxAge: 1000
})

// since this app has no user-specific content, every page is micro-cacheable.
// if your app involves user-specific content, you need to implement custom
// logic to determine whether a request is cacheable based on its url and
// headers.
const isCacheable = req => useMicroCache

function render (req, res) {
  const s = Date.now()

  res.setHeader("Content-Type", "text/html")
  res.setHeader("Server", serverInfo)

  const handleError = err => {
    if (err.url) {
      res.redirect(err.url)
    } else if(err.code === 404) {
      res.status(404).end('404 | Page Not Found')
    } else {
      // Render Error Page or Redirect
      res.status(500).end('500 | Internal Server Error')
      console.error(`error during render : ${req.url}`)
      console.error(err.stack)
    }
  }

  const cacheable = isCacheable(req)
  if (cacheable) {
    const hit = microCache.get(req.url)
    if (hit) {
      if (!isProd) {
        console.log(`cache hit!`)
      }
      return res.end(hit)
    }
  }

  const context = {
    title: 'vueblog',
    url: req.url,
    cookies: req.cookies
  }
  renderer.renderToString(context, (err, html) => {
    if (err) {
      return handleError(err)
    }
    res.end(html)
    if (cacheable) {
      microCache.set(req.url, html)
    }
    if (!isProd) {
      console.log(`whole request: ${Date.now() - s}ms`)
    }
  })
}

// client http intercept
app.get('/login', function(req, res, next) {
  if (req.cookies.token) {
    res.redirect('/index')
  } else {
    next()
  }
})

// server http intercept
app.get(['/admin', '/admin/*', '/publish', '/publish/*', '/updateAdminPassword', '/updateAdminInfo'], function(req, res, next) {
  if (req.cookies.token) {
    next()
  } else {
    res.redirect('/login')
  }
})

// published articles
app.get('/api/posts', router.posts);

// administrator infomation
app.get('/api/administrator', router.admin);

// article detail content http://localhost/api/article?id=1496841740682
app.get('/api/article', router.getArticle);

// tags infomation
app.get('/api/tags', router.tags);

// get articles by tag http://localhost/api/tag?tag=javascript
app.get('/api/tag', router.tag);

// search articles http://localhost/api/search?q=js
app.get('/api/search', router.search);

// archives infomation
app.get('/api/archives', router.archives);

// get articles by archive http://localhost/api/archive?date=201706
app.get('/api/archive', router.archive);

// all articles
app.get('/api/articles', router.articles);

// publish or edit article
app.post('/api/article', hasToken, router.article);

// administrator login
app.post('/api/login',router.login);

// administrator logout
app.post('/api/logout', router.logout);

// update administrator infomation
app.put('/api/administrator', hasToken, router.updateAdminInfo);

// update administrator avatar
app.post('/api/avatar', hasToken, router.avatar);

// update administrator password
app.put('/api/password', hasToken, router.updateAdminPassword);

// delete article  http://localhost/api/article?id=1496841740682
app.delete('/api/article', hasToken, router.deleteArticle);

app.get('*', isProd ? render : (req, res) => {
  readyPromise.then(() => render(req, res))
})

const port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080
const ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0'
app.listen(port, ip, () => {
  console.log(`server started at localhost:${port}`)
})