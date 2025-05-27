const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');
const { minify: minifyHTML } = require('html-minifier');

console.log('🔨 Building production version...');

// สร้างโฟลเดอร์ dist
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
}

async function buildProduction() {
    try {
        // อ่านไฟล์ index.html
        const htmlContent = fs.readFileSync('index.html', 'utf8');
        
        // แยก CSS และ JS จาก HTML
        const styleMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/);
        const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/g);
        
        if (!styleMatch) {
            throw new Error('ไม่พบ style tags');
        }
        
        const cssCode = styleMatch[1];
        
        // Minify CSS
        console.log('📦 Minifying CSS...');
        const minifiedCSS = new CleanCSS({
            level: 2,
            format: false
        }).minify(cssCode).styles;
        
        // Process all script tags
        let processedHTML = htmlContent;
        
        if (scriptMatch) {
            for (let i = 0; i < scriptMatch.length; i++) {
                const fullScript = scriptMatch[i];
                const jsMatch = fullScript.match(/<script[^>]*>([\s\S]*?)<\/script>/);
                
                if (jsMatch && jsMatch[1].trim().length > 100) { // Only process large scripts
                    console.log(`🔐 Obfuscating JavaScript ${i + 1}...`);
                    
                    const jsCode = jsMatch[1];
                    const obfuscatedJS = await minify(jsCode, {
                        compress: {
                            dead_code: true,
                            drop_console: false, // Keep console for protection
                            drop_debugger: true,
                            passes: 3,
                            unsafe: true,
                            unsafe_comps: true,
                            unsafe_Function: true,
                            unsafe_math: true,
                            unsafe_proto: true,
                            unsafe_regexp: true,
                            unsafe_undefined: true
                        },
                        mangle: {
                            toplevel: true,
                            properties: {
                                regex: /^[_$]/
                            }
                        },
                        format: {
                            comments: false,
                            beautify: false
                        }
                    });
                    
                    const minifiedScript = fullScript.replace(jsMatch[1], obfuscatedJS.code);
                    processedHTML = processedHTML.replace(fullScript, minifiedScript);
                }
            }
        }
        
        // Replace minified CSS
        processedHTML = processedHTML.replace(/<style>[\s\S]*?<\/style>/, `<style>${minifiedCSS}</style>`);
        
        // Minify HTML
        console.log('🗜️ Minifying HTML...');
        const finalHTML = minifyHTML(processedHTML, {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            useShortDoctype: true,
            minifyCSS: true,
            minifyJS: false // Already minified
        });
        
        // เขียนไฟล์ production
        fs.writeFileSync('dist/index.html', finalHTML);
        
        // คัดลอกไฟล์อื่นๆ
        const filesToCopy = [
            'manifest.json',
            'sw.js', 
            'offline.html',
            'vercel.json',
            'package.json'
        ];
        
        filesToCopy.forEach(file => {
            if (fs.existsSync(file)) {
                let content = fs.readFileSync(file, 'utf8');
                
                // Minify service worker
                if (file === 'sw.js') {
                    console.log('🔧 Minifying Service Worker...');
                    minify(content, {
                        compress: { drop_console: true },
                        mangle: true
                    }).then(result => {
                        fs.writeFileSync(`dist/${file}`, result.code);
                    });
                } else {
                    fs.writeFileSync(`dist/${file}`, content);
                }
            }
        });
        
        // สร้าง .htaccess สำหรับ Apache (หากต้องการ)
        const htaccess = `
# Disable server signature
ServerSignature Off

# Prevent access to .htaccess itself
<Files .htaccess>
Order allow,deny
Deny from all
</Files>

# Prevent directory browsing
Options -Indexes

# Disable right-click and text selection (fallback)
<Files "*.html">
    Header always set X-Frame-Options "DENY"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
</Files>

# Cache static files
<IfModule mod_expires.c>
    ExpiresActive on
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType application/javascript "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType image/svg+xml "access plus 1 year"
</IfModule>
        `.trim();
        
        fs.writeFileSync('dist/.htaccess', htaccess);
        
        // สร้าง robots.txt
        const robots = `
User-agent: *
Disallow: /sw.js
Disallow: /manifest.json
Disallow: /*.js$
Disallow: /*.css$

# สำหรับ SPA ไม่จำเป็นต้องมี sitemap
# Allow: /
        `.trim();
        
        fs.writeFileSync('dist/robots.txt', robots);
        
        // แสดงสถิติการ build
        const originalSize = fs.statSync('index.html').size;
        const minifiedSize = fs.statSync('dist/index.html').size;
        const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
        
        console.log('✅ Build completed successfully!');
        console.log('📊 File sizes:');
        console.log(`   Original: ${(originalSize / 1024).toFixed(2)} KB`);
        console.log(`   Minified: ${(minifiedSize / 1024).toFixed(2)} KB`);
        console.log(`   Reduction: ${reduction}%`);
        console.log('📁 Output: ./dist/');
        console.log('\n🚀 Ready to deploy with: npm run deploy');
        
    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

buildProduction();