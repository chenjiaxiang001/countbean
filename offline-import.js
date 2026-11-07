document.querySelector('#offlineOcrFile').addEventListener('change',async event=>{
  const input=event.target,file=input.files?.[0];if(!file)return;
  const status=document.querySelector('#offlineOcrStatus'),button=document.querySelector('#recognizePattern');
  const wasDisabled=button.disabled;input.disabled=true;button.disabled=true;
  try{
    await OCRDownload.importPackage(file,message=>status.textContent=message);
    ocrWorker?.terminate();ocrWorker=null;ocrWorkerPromise=null;
    status.textContent='离线识别包已保存。可以直接识别图纸，无需再下载模型；库存和图纸未改变。';
  }catch(error){status.textContent='离线包导入失败：'+(error.message||'请重新下载识别包后重试。');}
  finally{input.disabled=false;input.value='';button.disabled=wasDisabled;}
});
