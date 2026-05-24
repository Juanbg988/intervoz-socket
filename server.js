const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors:{
        origin:['https://intervoz.infinityfreeapp.com/'],
        methods:["GET","POST"]
    }
});

let interpretes = {};
let solicitudes = {};

io.on('connection', (socket)=>{

    console.log('Usuario conectado', socket.id);

    /*
    ========================================
    REGISTRAR SOLICITANTE
    ========================================
    */
    
    socket.on('registrarSolicitante', (data) => {
        socket.id_usuario = data.id_usuario;
    });

    /*
    ========================================
    RECONECTAR SOLICITANTE
    ========================================
    */

    socket.on(
        'reconectarSolicitante',
        (data)=>{

            if(
                solicitudes[data.id_solicitud]
            ){

                solicitudes[
                    data.id_solicitud
                ].solicitanteSocket =
                socket.id;

            }

        }
    );

    /*
    ========================================
    REGISTRAR INTERPRETE
    ========================================
    */

    socket.on('registrarInterprete', (data)=>{

        interpretes[data.id_interprete] = {
            socketId: socket.id,
            disponible: true,
            lenguas:data.lenguas
        };
        console.log(interpretes);

    });

    /*
    ========================================
    DISPONIBILIDAD
    ========================================
    */

    socket.on('cambiarDisponibilidad',(data)=>{
        if(interpretes[data.id_interprete]){
            interpretes[data.id_interprete].disponible =
                data.disponible;
        }
    });

    /*
    ========================================
    BUSCAR INTERPRETES
    ========================================
    */

    socket.on('buscarInterpretes', (data)=>{

        solicitudes[data.id_solicitud] = {
            solicitanteSocket: socket.id,
            aceptada:false,
            cancelada:false,
            interpretesNotificados:[]
        };

        let enviados = 0;

        Object.keys(interpretes).forEach((id)=>{

            const interprete = interpretes[id];

            if(!interprete.disponible){
                return;
            }

            const coincide = interprete.lenguas.some((l)=>{
                return(
                    parseInt(l.id_lengua)
                    ===
                    parseInt(data.id_lengua)
                    &&
                    parseInt(l.id_municipio)
                    ===
                    parseInt(data.id_municipio)
                );
            });

            if(coincide){
                enviados++;

                solicitudes[
                    data.id_solicitud
                ].interpretesNotificados.push(id);

                io.to(interprete.socketId).emit(
                    'llamadaEntrante',
                    data
                );
            }
        });

        io.to(socket.id).emit(
            'interpretesNotificados',
            { total: enviados }
        );

    });

    /*
    ========================================
    CANCELAR
    ========================================
    */
    
    socket.on('cancelarLlamada', (data)=>{

        const solicitud =
        solicitudes[data.id_solicitud];

        if(!solicitud){
            return;
        }

        solicitud.cancelada = true;

        solicitud.interpretesNotificados
        .forEach((id_interprete)=>{
        
            if(
                interpretes[id_interprete]
            ){
            
                io.to(
                    interpretes[id_interprete]
                    .socketId
                ).emit(
                    'llamadaCancelada'
                );
            
            }
        
        });
        delete solicitudes[data.id_solicitud];
    });

    /*
    ========================================
    ACEPTAR LLAMADA
    ========================================
    */

    socket.on('aceptarLlamada', async (data)=>{

        /*
        ====================================
        DESACTIVAR DISPONIBILIDAD
        ====================================
        */

        Object.keys(interpretes).forEach((id)=>{
        
            if(
                interpretes[id].socketId
                ===
                socket.id
            ){
            
                interpretes[id].disponible =
                false;
            
            }
        });

        const solicitud =
        solicitudes[data.id_solicitud];

        if(!solicitud){
            return;
        }

        if(solicitud.cancelada){

            io.to(socket.id).emit(
                'llamadaCancelada'
            );

            return;
        }

        if(
            solicitud.aceptada === true
        ){
        
            io.to(socket.id).emit(
                'llamadaYaAceptada'
            );
        
            return;
        }

        /*
        ====================================
        BLOQUEAR INMEDIATAMENTE
        ====================================
        */

        solicitud.aceptada = true;
        solicitud.interpreteAceptado =
        socket.id;

        /*
        =====================================
        CREAR ROOM JITSI
        =====================================
        */

        const roomName =
        `intervoz_${data.id_solicitud}`;

        /*
        =====================================
        NOTIFICAR SOLICITANTE
        =====================================
        */

        io.to(
            solicitud.solicitanteSocket
        ).emit(
            'llamadaAceptada',
            {
                roomName
            }
        );

        /*
        =====================================
        NOTIFICAR INTERPRETE
        =====================================
        */

        io.to(socket.id).emit(
            'entrarSala',
            {
                roomName
            }
        );

        /*
        =====================================
        BLOQUEAR A OTROS INTERPRETES
        =====================================
        */

        solicitud.interpretesNotificados
        .forEach((id_interprete)=>{
        
            const interprete =
            interpretes[id_interprete];
        
            if(!interprete){
                return;
            }
        
            if(
                interprete.socketId
                !==
                socket.id
            ){
            
                io.to(
                    interprete.socketId
                ).emit(
                    'llamadaYaAceptada'
                );
            
            }
        
        });

        setTimeout(()=>{
            delete solicitudes[
                data.id_solicitud
            ];

        }, 1000 * 60 * 60);

    });

    /*
    =================================
    DESCONECTAR
    =================================
    */

    socket.on('disconnect', ()=>{
        Object.keys(interpretes).forEach((id)=>{
            if(
                interpretes[id].socketId === socket.id
            ){
                delete interpretes[id];
            }
        });
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, ()=>{
    console.log('Servidor ejecutando', PORT);
});