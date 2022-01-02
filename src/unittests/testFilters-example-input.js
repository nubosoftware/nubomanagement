

var dataArr = [
    {
        api: '/cp/getOUs',
        query: {},
        body: {
	        session: '052f49eb4bb9a188ca47058e3659eee5ddc1b8b16c78185858ac8387df84bcd947888704dddf08a732493d4a5d8daa31',
	        secret: 'chewbacca'
        },
        headers: {
            "Content-Type": "application/json",
            "controlpanelid": "635a5e4be085fec378aa23e85fa1e7c39bf7a9005659f04b882128b52d9044e9711d3a1ba322f18b506cf1a2be982289"
        },
        expect: true
    },
    {
        api: '/sdfsdf',
        query: {},
        body: {
	        session: '052f49eb4bb9a188ca47058e3659eee5ddc1b8b16c78185858ac8387df84bcd947888704dddf08a732493d4a5d8daa31',
	        secret: 'chewbacca'
        },
        headers: {
            "Content-Type": "application/json",
            "controlpanelid": "635a5e4be085fec378aa23e85fa1e7c39bf7a9005659f04b882128b52d9044e9711d3a1ba322f18b506cf1a2be982289"
        },
        expect: true
    },
    {
        api: '/cp/syncAD',
        query: {
                adDomain: "nubosoftware.com",
                orgUnits: "dfgsfgsdgfdggfd###"
        },
        body: {
                session: '052f49eb4bb9a188ca47058e3659eee5ddc1b8b16c78185858ac8387df84bcd947888704dddf08a732493d4a5d8daa31',
                secret: 'chewbacca'
        },
        headers: {
            "Content-Type": "application/json",
            "controlpanelid": "635a5e4be085fec378aa23e85fa1e7c39bf7a9005659f04b882128b52d9044e9711d3a1ba322f18b506cf1a2be982289"
        },
        expect: false
    },
]
module.exports = dataArr;
