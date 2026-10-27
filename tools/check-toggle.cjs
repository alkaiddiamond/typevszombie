const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:960}});
 await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:/开始第/}).waitFor();
 await page.getByRole('button',{name:/菜单/}).click();
 const toggle=page.getByRole('checkbox',{name:'无限道具',exact:true});
 for(const enabled of [true,false,true,false]){
  await toggle.setChecked(enabled);await page.waitForTimeout(300);
  const sizes=await page.evaluate(()=>{const h=document.querySelector('.canvas-host').getBoundingClientRect(),c=document.querySelector('canvas').getBoundingClientRect();return{host:[h.width,h.height],canvas:[c.width,c.height],gap:[c.x-h.x,c.y-h.y]};});
  console.log(JSON.stringify({enabled,...sizes}));
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
