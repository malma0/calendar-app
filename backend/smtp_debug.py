import os
import ssl
import socket
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'))

host = (os.getenv('SMTP_HOST') or 'smtp.gmail.com').strip()
ports = [465, 587]
timeout = int((os.getenv('SMTP_TIMEOUT') or '8').strip())

print(f'HOST={host}')
print(f'TIMEOUT={timeout}')

for port in ports:
    print(f'\n=== TEST {host}:{port} ===')
    try:
        infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
        ips = []
        for info in infos:
            ip = info[4][0]
            if ip not in ips:
                ips.append(ip)
        print('IPv4:', ', '.join(ips) if ips else 'none')
    except Exception as exc:
        print('DNS error:', exc)
        continue

    for ip in ips:
        print(f'- connect {ip}:{port}')
        try:
            sock = socket.create_connection((ip, port), timeout=timeout)
            print('  TCP OK')
            if port == 465:
                ctx = ssl.create_default_context()
                ssock = ctx.wrap_socket(sock, server_hostname=host)
                print('  SSL OK, cipher=', ssock.cipher())
                banner = ssock.recv(1024)
                print('  banner=', banner.decode(errors='ignore').strip())
                ssock.close()
            else:
                banner = sock.recv(1024)
                print('  banner=', banner.decode(errors='ignore').strip())
                sock.sendall(b'EHLO localhost\r\n')
                print('  ehlo=', sock.recv(2048).decode(errors='ignore').strip())
                sock.sendall(b'STARTTLS\r\n')
                print('  starttls=', sock.recv(2048).decode(errors='ignore').strip())
                sock.close()
        except Exception as exc:
            print('  FAIL:', repr(exc))
