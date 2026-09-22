export function seededRandom(seed){
  let value=Number(seed)|0;
  return()=>{value=value+0x6D2B79F5|0;let mixed=value;mixed=Math.imul(mixed^mixed>>>15,mixed|1);mixed^=mixed+Math.imul(mixed^mixed>>>7,mixed|61);return((mixed^mixed>>>14)>>>0)/4294967296}
}

export function stableShuffle(items,seed){
  const result=[...items],random=seededRandom(seed);
  for(let index=result.length-1;index>0;index--){
    const target=Math.floor(random()*(index+1));
    [result[index],result[target]]=[result[target],result[index]];
  }
  return result;
}

export function createRandomSeed(cryptoApi=globalThis.crypto){
  const values=new Uint32Array(1);
  if(cryptoApi?.getRandomValues)cryptoApi.getRandomValues(values);
  else values[0]=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;
  return values[0]|0;
}