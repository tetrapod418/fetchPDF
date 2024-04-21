const { exit } = require('process');
const {KintoneRestAPIClient} = require('@kintone/rest-api-client');
const { log, error } = require('console');
const { getDiffieHellman } = require('crypto');
const { createWriteStream, existsSync } = require('fs');
const { readFile, exists } = require('fs/promises')
const { pipeline } = require('stream/promises');
const { resolve } = require('path');
const { subscribe } = require('diagnostics_channel');
const { rejects, strict } = require('assert');


(async ()=>{

    try {
        // クライアントの作成
        const client = new KintoneRestAPIClient({
          // kintoneのデータ取得先を設定
          baseUrl: 'https://1lc011kswasj.cybozu.com',
          auth: {
            apiToken: process.env.KINTONE_FETCH_API_TOKEN
          }
        });
    
        console.log(`${!process.env.KINTONE_FETCH_API_TOKEN?"NO TOKEN" : "SET TOKEN"}`);

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
                // ファイル情報の取得
                const { fileKey, name, contentType } = record['pdf'].value[0];
                // 拡張子がpdfだったら、pdffonts実行結果の登録
                const extention = (name.split('.').slice(-1)[0]).toLowerCase();
                console.log(`拡張子: ${extention}`);
                if( extention === 'pdf'){
                    const fullPath = `./temp/${name}`;
                    const resultPath = fullPath.replace(".pdf", ".txt");
                    // pdffontsの実行結果反映とステータス更新
                    return updateAppRecord(client, APP_ID, record.$id.value, resultPath);
                }
            }
        )
    } catch (err) {
        console.error(`実行失敗 :${err.message}`);
    }
})();


// 対象レコードへのpdffontsの結果反映とステータス更新
async function updateAppRecord(client, app, recordid, resultPath) {
    try {
        console.log(`ID${recordid} : 結果ファイルの読み込み ${resultPath}`);
        // 結果の読み込み
        const pdffontsResult = await readFile(resultPath, { encoding: "utf8" });
        if(pdffontsResult.length<=0){
            throw new Error(`pdffontsResult is empty!`);
        }
        // pdffonts実行結果のパース
        const rows = pdffontsResult.split('\n').map(
            (row) => {
                const checkHeader = new String(row);
                if(!checkHeader.startsWith("name") && !checkHeader.startsWith("---") && checkHeader.length > 0){
                    return parsLine(row);
                }
                });

        console.log(`rows[0]:\n ${rows}`);
        // レコードのpdffonts結果テキストを更新
        const params = {
            app,
            id: recordid,
            record: {
                "results_text" : {
                        "value": pdffontsResult
                },
                "pdffonts_result_table" : {
                    "value": rows
                }
            }
        }
        client.record.updateRecord(params, (err) => {
            if (err) {
                console.error(err.message);
                return Promise.reject(err);
            }
            console.log('record update success');
        });
        // // ステータス更新
        // const statusParams = {
        //     action : "自動チェック済",
        //     app,
        //     id: recordid,
        // }
        // client.record.updateRecordStatus(statusParams, (err) => {
        //     if (err) {
        //         console.error(err.message);
        //         return Promise.reject(err);
        //     }
        // });
        return Promise.resolve(true);
    } catch(err) {
        console.log(`An error occurred in updateAppRecord!\n${err.message}`)
        return Promise.reject(err);
    }
}

// pdffontsの結果を配列に変換
async function parsLine(line) {
    try{
        const namebae = new String(line).substring(0, "------------------------------------".length);
        const name = namebae.trimEnd();
        console.log(`name: ${name}`);
        const lineStr = new String(line);
        const fonttypelinebase = lineStr.substring(namebase.length);
        const fonttypeline = fonttypelinebase.substring(0, "-----------------".length);
        const fonttype = fonttypeline.trimEnd();
        const encodinglinebase = fonttypelinebase.substring(fonttypeline.length);
        const encodingline = fonttypelinebase.substring(fonttypeline.length, "----------------".length);
        const encoding = encodingline.trimEnd();
        const emblinebase = encodinglinebase.substring(encodingline.length);
        const embline = encodinglinebase.substring(encodingline.length, "---".length);
        const emb = embline.trimEnd();
        const sublinebase = emblinebase.substring(embline.length);
        const subline = emblinebase.substring(embline.length, "---".length);
        const sub = subline.trimEnd();
        const uniline = subline.substring(sub.length).trim();
        const uni = uniline.split(" ")[0];
        const objectID = uniline.substring(uni.length).trim();
        console.log(`got ${name}, ${fonttype}, ${encoding}, ${emb}, ${sub}, ${uni}, ${objectID}`);
        const result = { 
            value: {
                name: {
                    type: 'SINGLE_LINE_TEXT',
                    value: name
                },
                type: {
                    type: 'SINGLE_LINE_TEXT',
                    value: fonttype
                },
                encoding: {
                    type: 'SINGLE_LINE_TEXT',
                    value: encoding
                },
                emb: {
                    type: 'SINGLE_LINE_TEXT',
                    value: emb
                },
                sub: {
                    type: 'SINGLE_LINE_TEXT',
                    value: sub
                },
                uni: {
                    type: 'SINGLE_LINE_TEXT',
                    value: uni
                },
                object_id: {
                    type: 'SINGLE_LINE_TEXT',
                    object: objectID
                }
            }
        };
        console.log(`result= ${result.value}`);
        return result;

    }
    catch(err){
        console.log("parsLine error");
    }
}