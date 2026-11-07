(function(root){
  'use strict';
  class TextReader {
    constructor(ort,session,characters){this.ort=ort;this.session=session;this.characters=['',...characters,' '];}
    async read(image){
      if(!image||image.width<2||image.height<2)return {text:'',confidence:0};
      const h=48,w=320,rw=Math.min(w,Math.ceil(h*image.width/image.height)),input=new Float32Array(3*h*w);
      for(let y=0;y<h;y++)for(let x=0;x<rw;x++){
        const sx=Math.max(0,Math.min(image.width-1,(x+.5)*image.width/rw-.5)),sy=Math.max(0,Math.min(image.height-1,(y+.5)*image.height/h-.5));
        const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(image.width-1,x0+1),y1=Math.min(image.height-1,y0+1),dx=sx-x0,dy=sy-y0;
        for(let c=0;c<3;c++){
          const ch=2-c,a=image.data[(y0*image.width+x0)*4+ch],b=image.data[(y0*image.width+x1)*4+ch],d=image.data[(y1*image.width+x0)*4+ch],e=image.data[(y1*image.width+x1)*4+ch];
          input[c*h*w+y*w+x]=((a*(1-dx)+b*dx)*(1-dy)+(d*(1-dx)+e*dx)*dy)/127.5-1;
        }
      }
      const outputs=await this.session.run({[this.session.inputNames[0]]:new this.ort.Tensor('float32',input,[1,3,h,w])});
      const output=outputs[this.session.outputNames[0]],classes=output.dims[2];let previous=0,text='',confidence=0,n=0;
      for(let step=0;step<output.dims[1];step++){
        let best=0;for(let k=1;k<classes;k++)if(output.data[step*classes+k]>output.data[step*classes+best])best=k;
        if(best&&best!==previous){text+=this.characters[best]||'';confidence+=output.data[step*classes+best];n++;}previous=best;
      }
      for(const tensor of Object.values(outputs))tensor.dispose?.();
      return {text,confidence:n?confidence/n:0};
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=TextReader;else root.ChartTextReader=TextReader;
})(typeof globalThis!=='undefined'?globalThis:this);
