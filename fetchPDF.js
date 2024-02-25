const { exit } = require('process');
const {KintoneRestAPIClient} = require('@kintone/rest-api-client');
const { log } = require('console');
const { getDiffieHellman } = require('crypto');
const {createWriteStream} = require('fs');


(async ()=>{

    try {
        // クライアントの作成
        const client = new KintoneRestAPIClient({
          // kintoneのデータ取得先を設定
          baseUrl: 'https://1lc011kswasj.cybozu.com',
          auth: {
            apiToken: process.env.KINTONE_API_TOKEN
          }
        });
    
        console.log(`${!process.env.KINTONE_API_TOKEN?"NO TOKEN" : "SET TOKEN"}`);

        // リクエストパラメータの設定
        const APP_ID = 4;
        const query_string = 'ステータス="自動チェック中"';
        const params = {
          app: APP_ID,
          fields:['$id', 'ステータス', 'title', 'pdf'],
          query: query_string
        };
        
        // レコードの取得
        const record = await client.record.getRecords(params);
        if(!record || record.records.length === 0){
          console.log('nodata');
          return;
        }
  
        console.log(`getRecords ${record.records.length} records`);
        record.records.map(
            (record) => {
                const { fileKey, name, contentType } = record['pdf'].value[0];
                
                console.log(`filekey=${fileKey}, contentType=${contentType}`);
                getFile(fileKey, name, contentType);
            }
        )
    } catch (err) {
        console.error(err);
    }
})();

async function getFile(key, name, contentType){
    try{
        const headers = {
            'X-Requested-With': 'XMLHttpRequest',
        };
        const resp = await fetch(`https://1lc011kswasj.cybozu.com/k/v1/${name}?fileKey=${key}`, {
            method: 'GET',
            headers,
        })
        .then((resp) => {
            const savePath = `temp/${name}`;
            const distStream = createWriteStream(savePath);
            resp.body.pipeTo();
            console.log(`ファイル書き出しOK=>${name}`);
        });
    }
    catch (err) {
        console.error(err);
    }
}