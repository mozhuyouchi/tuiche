# 阿里云服务器接口

这个目录里的 `aliyun-server.js` 是给阿里云服务器部署的数据接口。页面仍然可以放在 GitHub Pages，数据会改成请求这个服务器。

## 服务器要求

- Node.js 18 或以上
- 一个可以 HTTPS 访问的域名，例如 `https://api.example.com`

GitHub Pages 是 HTTPS 页面，所以接口也必须是 HTTPS。否则浏览器会拦截请求。

## 启动

把 `server` 文件夹上传到阿里云服务器后，在服务器里运行：

```bash
node aliyun-server.js
```

默认监听 `3000` 端口。也可以指定端口：

```bash
PORT=3000 node aliyun-server.js
```

数据会保存在同目录的 `car-states.json`，这个文件不要放到 GitHub。

## Nginx 转发示例

如果域名是 `https://api.example.com`，可以把 `/api/` 转发到本机 `3000` 端口：

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3000/api/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

## 前端填写地址

打开 `db.js`，找到：

```js
const CUSTOM_API_BASE_URL = "";
```

改成朋友给你的接口地址：

```js
const CUSTOM_API_BASE_URL = "https://api.example.com/api";
```

保存后提交到 GitHub，页面就会从 Supabase 改成阿里云服务器。

## 现有数据

切换前如果要保留旧数据，先在管理端进入团号，等页面载入旧数据后，再修改 `CUSTOM_API_BASE_URL` 并重新进入管理端。同一个团号第一次进入时，阿里云服务器会创建这个团并保存当前页面数据。
