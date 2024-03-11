const { exit } = require('process');
const {KintoneRestAPIClient} = require('@kintone/rest-api-client');
const { log } = require('console');
const { getDiffieHellman } = require('crypto');
const {createWriteStream} = require('fs');
const { pipeline } = require('stream/promises');


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
                // ファイルの取得
                getFile(record['pdf'].value[0]);
            }
        )
    } catch (err) {
        console.error(err);
    }
})();

// ファイルの取得
async function getFile(fileObj){
    try{
        const { fileKey, name, contentType } = fileObj;
        console.log(`fetch start ${name} contentType:${contentType}`)
        const headers = {
            'X-Requested-With': 'XMLHttpRequest',
            'X-Cybozu-API-Token': process.env.KINTONE_API_TOKEN
        };
        const resp = await fetch(`https://1lc011kswasj.cybozu.com/k/v1/file.json?fileKey=${fileKey}`, {
            method: 'GET',
            headers,
        });
        if(!resp.ok){
            throw new Error(`Network response was not OK [name]${name} [status]${resp.status}`);
        }
        const savePath = `temp/${name}`;
        const distStream = createWriteStream(savePath);
        // レスポンスをファイルに書き出し
        pipeline(resp.body, distStream);
        console.log(`ファイル書き出しOK=>${name}`);
    }
    catch (err) {
        console.error(err);
    }
}