const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  
  // Set fake token
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("user", JSON.stringify({ name: "Debug Bot", email: "debug@bot.com" }));
  });

  await page.goto('http://localhost:5000/src/pages/login.html');
  await new Promise(r => setTimeout(r, 1000));
  
  const token = await page.evaluate(() => {
    // Generate valid jwt using window if available or login via API manually
    return localStorage.getItem("token");
  });

  // if token missing, let's login by hacking the login endpoint
  if (!token) {
    console.log("No token, attempting login skip...");
  }
  
  await browser.close();
})();
