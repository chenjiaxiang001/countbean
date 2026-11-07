const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
function createStaticServer(root=path.resolve(__dirname,'..')){
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.onnx':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg'};
  return http.createServer((req,res)=>{
    let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
    if(name==='/'||name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);
    if(!file.startsWith(root+path.sep)||name.includes('/.git')||name.includes('/node_modules/')){res.writeHead(403).end();return;}
    fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});
  });
}
if(require.main===module)createStaticServer().listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`http://127.0.0.1:${process.env.PORT||4173}`));
module.exports={createStaticServer};
